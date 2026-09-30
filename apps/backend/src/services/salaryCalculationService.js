import { pool } from '../config/database.js';
import { AppError } from '../utils/AppError.js';

export const COMPANY_ADDRESS_DEFAULT =
  'No.59(228/B), 55th Cross, 3rd Block, Rajajinagar, Bangalore, Karnataka, India (Landmark: Behind Ram Mandir Temple)';

const MONEY = (n) => Number(Number(n || 0).toFixed(2));

/**
 * Custom PF rule (project exception — not the general statutory engine):
 * PF base = min(Basic + DA, PF_WAGE_CEILING)
 * Employee PF = base × EMPLOYEE_PF_PERCENT
 * Employer PF = base × EMPLOYER_PF_PERCENT
 */
export function calculatePf(basic, da, config) {
  const ceiling = Number(config.pf_wage_ceiling ?? 15000);
  const empPct = Number(config.employee_pf_percent ?? 12) / 100;
  const erPct = Number(config.employer_pf_percent ?? 13) / 100;
  const wage = Number(basic || 0) + Number(da || 0);
  const pfBase = Math.min(wage, ceiling);
  return {
    pfBase: MONEY(pfBase),
    employeePf: MONEY(pfBase * empPct),
    employerPf: MONEY(pfBase * erPct)
  };
}

/**
 * Optional ESI (configured rates). Disabled → ₹0.
 * When enabled: Employee/Employer ESI = gross × configured %.
 * Optional wage ceiling: above ceiling → ₹0 (statutory-style eligibility).
 * Does not modify PF rules.
 */
export function calculateEsi(grossSalary, config) {
  if (!Number(config.enable_esi)) {
    return {
      employeeEsi: 0,
      employerEsi: 0,
      esiStatus: 'DISABLED'
    };
  }
  const wage = Number(grossSalary || 0);
  const ceiling = Number(config.esi_wage_ceiling ?? 0);
  if (ceiling > 0 && wage > ceiling) {
    return {
      employeeEsi: 0,
      employerEsi: 0,
      esiStatus: 'ABOVE_CEILING'
    };
  }
  const empPct = Number(config.employee_esi_percent ?? 0.75) / 100;
  const erPct = Number(config.employer_esi_percent ?? 0) / 100;
  return {
    employeeEsi: MONEY(wage * empPct),
    employerEsi: MONEY(wage * erPct),
    esiStatus: 'APPLIED'
  };
}

export async function getSalaryConfiguration(companyId, asOfDate = null) {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const [rows] = await pool.query(
    `SELECT *
     FROM salary_configurations
     WHERE company_id = ?
       AND is_active = 1
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC
     LIMIT 1`,
    [companyId, date, date]
  );

  if (rows[0]) return rows[0];

  // Fallback defaults if config row missing
  return {
    company_id: companyId,
    name: 'Default',
    basic_percent: 40,
    da_percent_of_basic: 0,
    hra_percent_of_basic: 50,
    pf_wage_ceiling: 15000,
    employee_pf_percent: 12,
    employer_pf_percent: 13,
    enable_bonus: 0,
    bonus_type: 'ANNUAL',
    bonus_percent_of_basic: 8.33,
    enable_attendance_bonus: 0,
    attendance_bonus_amount: 0,
    attendance_min_percent: 95,
    enable_gratuity: 0,
    gratuity_percent_of_basic: 4.81,
    payroll_day_basis: 'FIXED_30_DAYS',
    enable_pt: 1,
    pt_amount: 200,
    pt_threshold: 15000,
    enable_esi: 0,
    employee_esi_percent: 0.75,
    employer_esi_percent: 3.25,
    esi_wage_ceiling: 21000,
    company_address: COMPANY_ADDRESS_DEFAULT
  };
}

export async function getApplicableStatutoryRules(companyId, payrollMonthDate) {
  const [rows] = await pool.query(
    `SELECT *
     FROM statutory_rules
     WHERE is_enabled = 1
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
       AND (company_id IS NULL OR company_id = ?)
     ORDER BY company_id DESC, id ASC`,
    [payrollMonthDate, payrollMonthDate, companyId]
  );
  return rows;
}

export async function getAttendanceSummary(employeeId, year, month) {
  const calendarDays = new Date(year, month, 0).getDate();
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(calendarDays).padStart(2, '0')}`;

  const [rows] = await pool.query(
    `SELECT
       status,
       COUNT(*) AS cnt,
       COALESCE(SUM(COALESCE(total_work_minutes, 0)), 0) AS total_minutes
     FROM attendance
     WHERE employee_id = ?
       AND attendance_date BETWEEN ? AND ?
     GROUP BY status`,
    [employeeId, start, end]
  );

  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.cnt)]));
  const presentDays = byStatus.PRESENT || 0;
  const halfDays = byStatus.HALF_DAY || 0;
  const absentDays = byStatus.ABSENT || 0;
  const paidLeave = byStatus.LEAVE || 0;
  const weeklyHolidays = byStatus.WEEK_OFF || 0;
  const publicHolidays = byStatus.HOLIDAY || 0;
  const missingPunch = byStatus.MISSING_PUNCH || 0;
  const markedDays = rows.reduce((s, r) => s + Number(r.cnt || 0), 0);
  const totalMinutes = rows.reduce((s, r) => s + Number(r.total_minutes || 0), 0);
  const workingDaysApprox = Math.max(1, calendarDays - weeklyHolidays - publicHolidays);
  const hasRecords = markedDays > 0;

  // LOP only from known absences / missing punches — unmarked days are not auto-deducted
  // (full-month punch coverage is not assumed in this HRMS).
  let lopDays = absentDays + missingPunch;
  let paidDays = Math.max(
    0,
    presentDays + halfDays * 0.5 + paidLeave + weeklyHolidays + publicHolidays
  );

  if (!hasRecords) {
    paidDays = workingDaysApprox;
    lopDays = 0;
  } else {
    // Credit remaining unmarked working days as paid (only deduct recorded LOP)
    const credited = presentDays + halfDays + absentDays + paidLeave + missingPunch;
    const unmarkedWorking = Math.max(0, workingDaysApprox - credited);
    paidDays = MONEY(paidDays + unmarkedWorking);
    // Cap paid days to working/calendar span
    paidDays = Math.min(paidDays, workingDaysApprox);
  }

  return {
    calendarDays,
    workingDays: workingDaysApprox,
    presentDays,
    halfDays,
    absentDays,
    paidLeave,
    weeklyHolidays,
    publicHolidays,
    missingPunch,
    markedDays,
    hasRecords,
    lopDays: MONEY(lopDays),
    paidDays: MONEY(paidDays),
    totalWorkingHours: MONEY(totalMinutes / 60),
    attendancePercent: !hasRecords
      ? 100
      : workingDaysApprox > 0
        ? MONEY(((workingDaysApprox - lopDays) / workingDaysApprox) * 100)
        : 0
  };
}

function monthlyBonusAmount(basic, config) {
  if (!Number(config.enable_bonus)) return 0;
  const pct = Number(config.bonus_percent_of_basic || 0) / 100;
  const annualBonus = basic * 12 * pct;
  switch (config.bonus_type) {
    case 'MONTHLY':
      return MONEY(basic * pct);
    case 'QUARTERLY':
      return MONEY(annualBonus / 4 / 3); // monthly accrual of quarterly
    case 'ANNUAL':
    default:
      return MONEY(annualBonus / 12);
  }
}

function dayBasisValue(config, attendance, runWorkingDays) {
  switch (config.payroll_day_basis) {
    case 'CALENDAR_DAYS':
      return attendance.calendarDays || 30;
    case 'WORKING_DAYS':
      return attendance.workingDays || runWorkingDays || 26;
    case 'FIXED_30_DAYS':
    default:
      return 30;
  }
}

/**
 * Central automatic salary calculation engine.
 * Frontend must never be the source of truth for these numbers.
 */
export function calculateSalaryStructure({
  annualCtc,
  config,
  attendanceSummary = null,
  overrides = {}
}) {
  const annual = Number(annualCtc);
  if (!annual || annual <= 0) {
    throw new AppError('Annual CTC must be a positive number.', 400);
  }

  const enableBonus = overrides.enableBonus ?? Boolean(Number(config.enable_bonus));
  const enableAttendanceBonus =
    overrides.enableAttendanceBonus ?? Boolean(Number(config.enable_attendance_bonus));
  const enableGratuity =
    overrides.enableGratuity ?? Boolean(Number(config.enable_gratuity));
  const pfApplicable = overrides.pfApplicable ?? true;
  const pfFor = (b, d) =>
    pfApplicable ? calculatePf(b, d, config) : { pfBase: 0, employeePf: 0, employerPf: 0 };

  const monthlyCtc = MONEY(annual / 12);
  const basic = MONEY((monthlyCtc * Number(config.basic_percent || 40)) / 100);
  const da = MONEY((basic * Number(config.da_percent_of_basic || 0)) / 100);
  const hra = MONEY((basic * Number(config.hra_percent_of_basic || 0)) / 100);

  const pf = pfFor(basic, da);
  const gratuity = enableGratuity
    ? MONEY((basic * Number(config.gratuity_percent_of_basic || 0)) / 100)
    : 0;

  const cfgForBonus = { ...config, enable_bonus: enableBonus ? 1 : 0 };
  const bonus = enableBonus ? monthlyBonusAmount(basic, cfgForBonus) : 0;

  // Special allowance balances CTC after mandatory earnings + employer contributions
  // Bonus / attendance bonus are optional extras shown separately (not in CTC budget)
  let specialAllowance = MONEY(
    monthlyCtc - basic - da - hra - pf.employerPf - gratuity
  );

  if (specialAllowance < 0) {
    throw new AppError(
      'Salary structure could not be reconciled with the entered CTC. Please review the salary configuration.',
      400
    );
  }

  let attendanceBonus = 0;
  let attendanceBonusEligible = 'DISABLED';
  if (enableAttendanceBonus) {
    const minPct = Number(config.attendance_min_percent || 95);
    const amount = Number(config.attendance_bonus_amount || 0);
    if (!attendanceSummary) {
      attendanceBonusEligible = 'REVIEW_REQUIRED';
      attendanceBonus = 0;
    } else if (Number(attendanceSummary.attendancePercent) >= minPct) {
      attendanceBonusEligible = 'ELIGIBLE';
      attendanceBonus = MONEY(amount);
    } else {
      attendanceBonusEligible = 'NOT_ELIGIBLE';
      attendanceBonus = 0;
    }
  }

  const earningsMonthly = MONEY(basic + da + hra + specialAllowance + bonus + attendanceBonus);
  const employerContributions = MONEY(pf.employerPf + gratuity);
  const ctcCheck = MONEY(basic + da + hra + specialAllowance + pf.employerPf + gratuity);

  if (Math.abs(ctcCheck - monthlyCtc) > 0.05) {
    throw new AppError(
      'Salary structure could not be reconciled with the entered CTC. Please review the salary configuration.',
      400
    );
  }

  // Attendance / LOP pro-rata on core earnings (exclude optional bonuses from LOP base)
  const coreGross = MONEY(basic + da + hra + specialAllowance);
  const basisDays = dayBasisValue(
    config,
    attendanceSummary || { calendarDays: 30, workingDays: 26 },
    overrides.workingDays
  );
  let paidDays =
    attendanceSummary != null
      ? Number(attendanceSummary.paidDays)
      : basisDays;
  let lopDays =
    attendanceSummary != null
      ? Number(attendanceSummary.lopDays)
      : 0;

  // Empty attendance month → full paid on configured day basis
  if (attendanceSummary && !attendanceSummary.hasRecords) {
    paidDays = basisDays;
    lopDays = 0;
  } else if (attendanceSummary && config.payroll_day_basis === 'FIXED_30_DAYS') {
    // Align paid days to 30-day basis minus recorded LOP
    paidDays = Math.max(0, basisDays - lopDays);
  }

  const payableCore = MONEY((coreGross / basisDays) * paidDays);
  const lopAmount = MONEY(Math.max(0, coreGross - payableCore));

  // Professional tax from config / statutory
  let professionalTax = 0;
  let ptStatus = 'DISABLED';
  if (Number(config.enable_pt)) {
    const threshold = Number(config.pt_threshold || 15000);
    if (payableCore + bonus + attendanceBonus >= threshold) {
      professionalTax = MONEY(config.pt_amount || 0);
      ptStatus = 'APPLIED';
    } else {
      ptStatus = 'BELOW_THRESHOLD';
    }
  }

  // Scale PF with attendance ratio on Basic+DA payable portion
  const attendanceRatio = basisDays > 0 ? Math.min(paidDays / basisDays, 1) : 0;
  const payableBasic = MONEY(basic * attendanceRatio);
  const payableDa = MONEY(da * attendanceRatio);
  const payableHra = MONEY(hra * attendanceRatio);
  const payableSpecial = MONEY(specialAllowance * attendanceRatio);
  const payablePf = pfFor(payableBasic, payableDa);

  const grossSalary = MONEY(
    payableBasic +
      payableDa +
      payableHra +
      payableSpecial +
      bonus +
      attendanceBonus
  );

  const esi = calculateEsi(grossSalary, config);

  const totalDeductions = MONEY(
    payablePf.employeePf +
      professionalTax +
      esi.employeeEsi +
      (overrides.otherDeductions || 0)
  );
  const netPay = MONEY(grossSalary - totalDeductions);
  const totalEmployerContribution = MONEY(
    payablePf.employerPf + gratuity + esi.employerEsi
  );

  return {
    annualCtc: MONEY(annual),
    monthlyCtc,
    basic,
    da,
    hra,
    specialAllowance,
    bonus,
    attendanceBonus,
    attendanceBonusEligible,
    gratuity,
    gratuityEligibility: enableGratuity ? 'ELIGIBLE' : 'DISABLED',
    employeePf: payablePf.employeePf,
    employerPf: payablePf.employerPf,
    pfBase: payablePf.pfBase,
    pfApplicable,
    fullMonthEmployeePf: pf.employeePf,
    fullMonthEmployerPf: pf.employerPf,
    employeeEsi: esi.employeeEsi,
    employerEsi: esi.employerEsi,
    esiStatus: esi.esiStatus,
    grossSalary,
    coreGross,
    payableCore,
    lopAmount,
    lopDays,
    paidDays: MONEY(paidDays),
    basisDays,
    professionalTax,
    ptStatus,
    totalEmployerContribution,
    totalDeductions,
    netPay,
    totalCtc: annual,
    earningsMonthly,
    employerContributions,
    attendanceSummary,
    configSnapshot: {
      basic_percent: Number(config.basic_percent),
      da_percent_of_basic: Number(config.da_percent_of_basic),
      hra_percent_of_basic: Number(config.hra_percent_of_basic),
      pf_wage_ceiling: Number(config.pf_wage_ceiling),
      employee_pf_percent: Number(config.employee_pf_percent),
      employer_pf_percent: Number(config.employer_pf_percent),
      enable_bonus: enableBonus,
      enable_attendance_bonus: enableAttendanceBonus,
      enable_gratuity: enableGratuity,
      enable_esi: Boolean(Number(config.enable_esi)),
      employee_esi_percent: Number(config.employee_esi_percent ?? 0.75),
      employer_esi_percent: Number(config.employer_esi_percent ?? 0),
      esi_wage_ceiling: Number(config.esi_wage_ceiling ?? 21000),
      payroll_day_basis: config.payroll_day_basis,
      company_address: config.company_address || COMPANY_ADDRESS_DEFAULT
    },
    components: [
      { code: 'BASIC', name: 'Basic', amount: payableBasic, annual: MONEY(basic * 12), monthly: basic, type: 'EARNING', contribution: 'NONE' },
      { code: 'DA', name: 'DA', amount: payableDa, annual: MONEY(da * 12), monthly: da, type: 'EARNING', contribution: 'NONE' },
      { code: 'HRA', name: 'HRA', amount: payableHra, annual: MONEY(hra * 12), monthly: hra, type: 'EARNING', contribution: 'NONE' },
      { code: 'SPECIAL_ALLOWANCE', name: 'Special Allowance', amount: payableSpecial, annual: MONEY(specialAllowance * 12), monthly: specialAllowance, type: 'EARNING', contribution: 'NONE' },
      { code: 'BONUS', name: 'Bonus', amount: bonus, annual: MONEY(bonus * 12), monthly: bonus, type: 'EARNING', contribution: 'NONE', enabled: enableBonus },
      { code: 'ATTENDANCE_BONUS', name: 'Attendance Bonus', amount: attendanceBonus, annual: MONEY(attendanceBonus * 12), monthly: attendanceBonus, type: 'EARNING', contribution: 'NONE', enabled: enableAttendanceBonus, eligibility: attendanceBonusEligible },
      { code: 'PF_EMPLOYEE', name: 'Employee PF', amount: payablePf.employeePf, annual: MONEY(pf.employeePf * 12), monthly: pf.employeePf, type: 'DEDUCTION', contribution: 'EMPLOYEE', enabled: pfApplicable },
      { code: 'PF_EMPLOYER', name: 'Employer PF', amount: payablePf.employerPf, annual: MONEY(pf.employerPf * 12), monthly: pf.employerPf, type: 'EMPLOYER', contribution: 'EMPLOYER', enabled: pfApplicable },
      { code: 'ESI_EMPLOYEE', name: 'Employee ESI', amount: esi.employeeEsi, annual: MONEY(esi.employeeEsi * 12), monthly: esi.employeeEsi, type: 'DEDUCTION', contribution: 'EMPLOYEE', enabled: Boolean(Number(config.enable_esi)), status: esi.esiStatus },
      { code: 'ESI_EMPLOYER', name: 'Employer ESI', amount: esi.employerEsi, annual: MONEY(esi.employerEsi * 12), monthly: esi.employerEsi, type: 'EMPLOYER', contribution: 'EMPLOYER', enabled: Boolean(Number(config.enable_esi)), status: esi.esiStatus },
      { code: 'GRATUITY', name: 'Gratuity', amount: gratuity, annual: MONEY(gratuity * 12), monthly: gratuity, type: 'EMPLOYER', contribution: 'EMPLOYER', enabled: enableGratuity },
      { code: 'PT', name: 'Professional Tax', amount: professionalTax, annual: MONEY(professionalTax * 12), monthly: professionalTax, type: 'DEDUCTION', contribution: 'EMPLOYEE' },
      { code: 'LOP', name: 'LOP', amount: lopAmount, type: 'DEDUCTION', contribution: 'EMPLOYEE' }
    ]
  };
}

export async function calculateEmployeeSalary({
  employeeId,
  annualCtc,
  companyId,
  periodYear,
  periodMonth,
  overrides = {}
}) {
  const asOf = `${periodYear}-${String(periodMonth).padStart(2, '0')}-01`;
  const config = await getSalaryConfiguration(companyId, asOf);
  const attendanceSummary = await getAttendanceSummary(employeeId, periodYear, periodMonth);
  const statutoryRules = await getApplicableStatutoryRules(companyId, asOf);

  // Merge PT from statutory rule if present and config doesn't override
  const ptRule = statutoryRules.find((r) => r.rule_type === 'PT');
  if (ptRule && Number(config.enable_pt)) {
    if (ptRule.threshold_amount != null) config.pt_threshold = ptRule.threshold_amount;
    // amount may live in ceiling or percentage fields for PT flat amount configs
    if (ptRule.ceiling_amount != null && !config.pt_amount) {
      config.pt_amount = ptRule.ceiling_amount;
    }
  }

  const result = calculateSalaryStructure({
    annualCtc,
    config,
    attendanceSummary,
    overrides
  });

  return {
    ...result,
    statutoryRules: statutoryRules.map((r) => ({
      id: r.id,
      rule_name: r.rule_name,
      rule_type: r.rule_type,
      percentage: r.percentage,
      threshold_amount: r.threshold_amount,
      ceiling_amount: r.ceiling_amount,
      contribution_side: r.contribution_side,
      applicability: r.applicability
    }))
  };
}

export function salaryResultToStoredComponents(result) {
  return [
    { component_code: 'BASIC', component_name: 'Basic', amount: result.basic, amount_status: 'SET', contribution_type: 'NONE', is_deduction: 0, sort_order: 1 },
    { component_code: 'DA', component_name: 'DA', amount: result.da, amount_status: result.da > 0 ? 'SET' : 'NOT_APPLICABLE', contribution_type: 'NONE', is_deduction: 0, sort_order: 2 },
    { component_code: 'HRA', component_name: 'HRA', amount: result.hra, amount_status: 'SET', contribution_type: 'NONE', is_deduction: 0, sort_order: 3 },
    { component_code: 'SPECIAL_ALLOWANCE', component_name: 'Special Allowance', amount: result.specialAllowance, amount_status: 'SET', contribution_type: 'NONE', is_deduction: 0, sort_order: 4 },
    { component_code: 'BONUS', component_name: 'Bonus', amount: result.bonus, amount_status: result.bonus > 0 ? 'SET' : 'NOT_APPLICABLE', contribution_type: 'NONE', is_deduction: 0, sort_order: 5 },
    { component_code: 'ATTENDANCE_BONUS', component_name: 'Attendance Bonus', amount: result.attendanceBonus, amount_status: result.configSnapshot.enable_attendance_bonus ? 'SET' : 'NOT_APPLICABLE', contribution_type: 'NONE', is_deduction: 0, sort_order: 6 },
    { component_code: 'PF_EMPLOYEE', component_name: 'Employee PF', amount: result.fullMonthEmployeePf, amount_status: result.pfApplicable === false ? 'NOT_APPLICABLE' : 'SET', contribution_type: 'EMPLOYEE', is_deduction: 1, sort_order: 10 },
    { component_code: 'PF_EMPLOYER', component_name: 'Employer PF', amount: result.fullMonthEmployerPf, amount_status: result.pfApplicable === false ? 'NOT_APPLICABLE' : 'SET', contribution_type: 'EMPLOYER', is_deduction: 0, sort_order: 11 },
    { component_code: 'ESI_EMPLOYEE', component_name: 'Employee ESI', amount: result.employeeEsi, amount_status: result.esiStatus === 'DISABLED' ? 'NOT_APPLICABLE' : 'SET', contribution_type: 'EMPLOYEE', is_deduction: 1, sort_order: 12 },
    { component_code: 'ESI_EMPLOYER', component_name: 'Employer ESI', amount: result.employerEsi, amount_status: result.esiStatus === 'DISABLED' ? 'NOT_APPLICABLE' : 'SET', contribution_type: 'EMPLOYER', is_deduction: 0, sort_order: 13 },
    { component_code: 'GRATUITY', component_name: 'Gratuity', amount: result.gratuity, amount_status: result.gratuity > 0 ? 'SET' : 'NOT_APPLICABLE', contribution_type: 'EMPLOYER', is_deduction: 0, sort_order: 14 },
    { component_code: 'PT', component_name: 'Professional Tax', amount: result.professionalTax, amount_status: result.ptStatus === 'DISABLED' ? 'NOT_APPLICABLE' : 'SET', contribution_type: 'EMPLOYEE', is_deduction: 1, sort_order: 15 }
  ];
}

export function maskBankAccount(accountNumber) {
  if (!accountNumber) return null;
  const digits = String(accountNumber).replace(/\s/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return `${'*'.repeat(Math.max(digits.length - 4, 4))}${digits.slice(-4)}`;
}
