import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import {
  assertCompanyAccess,
  getCompanyIdsForUser,
  assertPermission
} from '../services/permissionService.js';
import { writeAuditLog } from '../services/auditService.js';
import {
  getActiveSalaryStructure,
  getStructureComponents,
  recalculatePayrollRunItems
} from '../services/payrollService.js';
import {
  calculateEmployeeSalary,
  calculateSalaryStructure,
  getSalaryConfiguration,
  salaryResultToStoredComponents,
  COMPANY_ADDRESS_DEFAULT
} from '../services/salaryCalculationService.js';
import {
  loadPayslipRowById,
  loadPayslipRowForRunEmployee,
  shapePayslip
} from '../services/payslipDataService.js';
import { isAttendancePeriodFinalized } from '../services/attendancePeriodService.js';
import {
  createDeliveriesForRun,
  listRunDeliveries,
  processRunDeliveriesInBackground,
  requeueDelivery,
  requeueFailedDeliveries
} from '../services/payslipDeliveryService.js';
import {
  createNotification,
  notifyRoleHolders
} from '../services/notificationService.js';

export const getEmployeeSalarySetup = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'salary', 'view');
  const employeeId = Number(req.params.employeeId);

  const [emps] = await pool.query(
    `SELECT id, full_name, employee_id, company_id, status
     FROM employees WHERE id = ? LIMIT 1`,
    [employeeId]
  );
  if (!emps.length) throw new AppError('Employee not found.', 404);
  await assertCompanyAccess(req.user, emps[0].company_id);

  const [structures] = await pool.query(
    `SELECT * FROM employee_salary_structures
     WHERE employee_id = ?
     ORDER BY effective_date DESC`,
    [employeeId]
  );

  const withComponents = [];
  for (const structure of structures) {
    const components = await getStructureComponents(structure.id);
    let snapshot = structure.calculation_snapshot;
    if (typeof snapshot === 'string') {
      try {
        snapshot = JSON.parse(snapshot);
      } catch {
        snapshot = null;
      }
    }
    withComponents.push({ ...structure, components, calculation: snapshot });
  }

  const config = emps[0].company_id
    ? await getSalaryConfiguration(emps[0].company_id)
    : null;

  const active = await getActiveSalaryStructure(employeeId);
  const [bankRows] = await pool.query(
    `SELECT uan_number FROM employee_bank_details WHERE employee_id = ? LIMIT 1`,
    [employeeId]
  );

  res.json({
    success: true,
    data: {
      employee: emps[0],
      structures: withComponents,
      active,
      salaryConfig: config,
      statutory: {
        pfApplicable: active ? Boolean(Number(active.pf_applicable ?? 1)) : true,
        uanNumber: bankRows[0]?.uan_number || null
      }
    }
  });
});

const UAN_PATTERN = /^\d{12}$/;

export const upsertEmployeeSalarySetup = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'salary', 'edit');
  const employeeId = Number(req.params.employeeId);
  const {
    companyId,
    location,
    ctc,
    effectiveDate,
    status = 'ACTIVE',
    notes,
    enableBonus = false,
    enableAttendanceBonus = false,
    enableGratuity = false,
    pfApplicable = true,
    uanNumber,
    components: manualComponents
  } = req.body;

  const uan = uanNumber == null ? undefined : String(uanNumber).replace(/\s/g, '');
  if (uan && !UAN_PATTERN.test(uan)) {
    throw new AppError('UAN must be exactly 12 digits.', 422, { fields: { uanNumber: 'Enter the 12-digit UAN.' } });
  }

  const [emps] = await pool.query(
    `SELECT id, company_id FROM employees WHERE id = ? LIMIT 1`,
    [employeeId]
  );
  if (!emps.length) throw new AppError('Employee not found.', 404);

  const resolvedCompanyId = Number(companyId || emps[0].company_id);
  await assertCompanyAccess(req.user, resolvedCompanyId);

  if (!effectiveDate || ctc == null) {
    throw new AppError('CTC and effective date are required.', 400);
  }

  const config = await getSalaryConfiguration(resolvedCompanyId, effectiveDate);
  const calc = calculateSalaryStructure({
    annualCtc: Number(ctc),
    config: {
      ...config,
      enable_bonus: enableBonus ? 1 : 0,
      enable_attendance_bonus: enableAttendanceBonus ? 1 : 0,
      enable_gratuity: enableGratuity ? 1 : 0
    },
    attendanceSummary: null,
    overrides: {
      enableBonus: Boolean(enableBonus),
      enableAttendanceBonus: Boolean(enableAttendanceBonus),
      enableGratuity: Boolean(enableGratuity),
      pfApplicable: Boolean(pfApplicable)
    }
  });

  const autoComponents = salaryResultToStoredComponents(calc);
  const list =
    Array.isArray(manualComponents) &&
    manualComponents.length &&
    req.body.useManualComponents
      ? manualComponents
      : autoComponents;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Earlier ACTIVE structures stay ACTIVE: payroll picks the one with the latest
    // effective_date on or before the month, so past months keep their own salary.
    const [existing] = await connection.query(
      `SELECT id FROM employee_salary_structures
       WHERE employee_id = ? AND effective_date = ?
       LIMIT 1`,
      [employeeId, effectiveDate]
    );

    let structureId;
    if (existing.length) {
      structureId = existing[0].id;
      await connection.query(
        `UPDATE employee_salary_structures
         SET company_id = ?, location = ?, ctc = ?, status = ?, notes = ?,
             enable_bonus = ?, enable_attendance_bonus = ?, enable_gratuity = ?, pf_applicable = ?,
             calculation_snapshot = ?, updated_by = ?
         WHERE id = ?`,
        [
          resolvedCompanyId,
          location || null,
          ctc,
          status,
          notes || null,
          enableBonus ? 1 : 0,
          enableAttendanceBonus ? 1 : 0,
          enableGratuity ? 1 : 0,
          pfApplicable ? 1 : 0,
          JSON.stringify(calc),
          req.user.id,
          structureId
        ]
      );
      await connection.query(
        `DELETE FROM salary_components WHERE structure_id = ?`,
        [structureId]
      );
    } else {
      const [result] = await connection.query(
        `INSERT INTO employee_salary_structures (
           employee_id, company_id, location, ctc, effective_date, status, notes,
           enable_bonus, enable_attendance_bonus, enable_gratuity, pf_applicable, calculation_snapshot,
           created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employeeId,
          resolvedCompanyId,
          location || null,
          ctc,
          effectiveDate,
          status,
          notes || null,
          enableBonus ? 1 : 0,
          enableAttendanceBonus ? 1 : 0,
          enableGratuity ? 1 : 0,
          pfApplicable ? 1 : 0,
          JSON.stringify(calc),
          req.user.id,
          req.user.id
        ]
      );
      structureId = result.insertId;
    }

    for (const component of list) {
      await connection.query(
        `INSERT INTO salary_components (
           structure_id, component_code, component_name, amount, amount_status,
           contribution_type, is_deduction, sort_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          structureId,
          component.component_code,
          component.component_name,
          component.amount_status === 'SET' || component.amount_status === 'NOT_APPLICABLE'
            ? component.amount
            : null,
          component.amount_status || 'SET',
          component.contribution_type || 'NONE',
          component.is_deduction ? 1 : 0,
          component.sort_order || 0
        ]
      );
    }

    if (uan) {
      await connection.query(
        `INSERT INTO employee_bank_details (employee_id, uan_number) VALUES (?, ?) AS incoming
         ON DUPLICATE KEY UPDATE uan_number = incoming.uan_number`,
        [employeeId, uan]
      );
    } else if (uan === '') {
      await connection.query(
        `UPDATE employee_bank_details SET uan_number = NULL WHERE employee_id = ?`,
        [employeeId]
      );
    }

    await connection.commit();

    await writeAuditLog({
      employeeId: req.user.id,
      action: 'SALARY_SETUP_SAVED',
      entityType: 'employee_salary_structures',
      entityId: structureId,
      newValues: {
        employeeId,
        ctc,
        effectiveDate,
        status,
        enableBonus,
        enableAttendanceBonus,
        enableGratuity,
        pfApplicable: Boolean(pfApplicable),
        uanChanged: uan !== undefined
      },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Salary setup saved. Components calculated automatically from CTC.',
      data: { structureId, calculation: calc }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const previewSalaryCalculation = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'salary', 'view');
  const {
    employeeId,
    companyId,
    annualCtc,
    periodYear,
    periodMonth,
    enableBonus = false,
    enableAttendanceBonus = false,
    enableGratuity = false,
    pfApplicable = true,
    configOverrides = null
  } = req.body;

  if (!annualCtc) throw new AppError('Annual CTC is required.', 400);

  let resolvedCompanyId = companyId ? Number(companyId) : null;
  if (employeeId) {
    const [emps] = await pool.query(
      `SELECT id, company_id FROM employees WHERE id = ? LIMIT 1`,
      [Number(employeeId)]
    );
    if (!emps.length) throw new AppError('Employee not found.', 404);
    resolvedCompanyId = resolvedCompanyId || emps[0].company_id;
    await assertCompanyAccess(req.user, resolvedCompanyId);

    const year = Number(periodYear || new Date().getFullYear());
    const month = Number(periodMonth || new Date().getMonth() + 1);

    if (configOverrides) {
      const baseConfig = await getSalaryConfiguration(
        resolvedCompanyId,
        `${year}-${String(month).padStart(2, '0')}-01`
      );
      const { getAttendanceSummary } = await import('../services/salaryCalculationService.js');
      const attendanceSummary = await getAttendanceSummary(Number(employeeId), year, month);
      const calculation = calculateSalaryStructure({
        annualCtc: Number(annualCtc),
        config: {
          ...baseConfig,
          basic_percent: configOverrides.basicPercent ?? baseConfig.basic_percent,
          da_percent_of_basic: configOverrides.daPercentOfBasic ?? baseConfig.da_percent_of_basic,
          hra_percent_of_basic: configOverrides.hraPercentOfBasic ?? baseConfig.hra_percent_of_basic,
          enable_bonus: enableBonus ? 1 : 0,
          enable_attendance_bonus: enableAttendanceBonus ? 1 : 0,
          enable_gratuity: enableGratuity ? 1 : 0,
          enable_esi:
            configOverrides.enableEsi != null
              ? configOverrides.enableEsi
                ? 1
                : 0
              : Number(baseConfig.enable_esi),
          employee_esi_percent: Number(
            configOverrides.employeeEsiPercent ?? baseConfig.employee_esi_percent ?? 0.75
          ),
          employer_esi_percent: Number(
            configOverrides.employerEsiPercent ?? baseConfig.employer_esi_percent ?? 3.25
          ),
          esi_wage_ceiling: Number(
            configOverrides.esiWageCeiling ?? baseConfig.esi_wage_ceiling ?? 21000
          )
        },
        attendanceSummary,
        overrides: {
          enableBonus: Boolean(enableBonus),
          enableAttendanceBonus: Boolean(enableAttendanceBonus),
          enableGratuity: Boolean(enableGratuity),
          pfApplicable: Boolean(pfApplicable)
        }
      });
      return res.json({ success: true, data: calculation });
    }

    const calculation = await calculateEmployeeSalary({
      employeeId: Number(employeeId),
      annualCtc: Number(annualCtc),
      companyId: resolvedCompanyId,
      periodYear: year,
      periodMonth: month,
      overrides: {
        enableBonus: Boolean(enableBonus),
        enableAttendanceBonus: Boolean(enableAttendanceBonus),
        enableGratuity: Boolean(enableGratuity),
        pfApplicable: Boolean(pfApplicable)
      }
    });
    return res.json({ success: true, data: calculation });
  }

  if (!resolvedCompanyId) throw new AppError('Company is required.', 400);
  await assertCompanyAccess(req.user, resolvedCompanyId);
  const config = await getSalaryConfiguration(resolvedCompanyId);
  const merged = configOverrides
    ? {
        ...config,
        basic_percent: Number(configOverrides.basicPercent ?? config.basic_percent),
        da_percent_of_basic: Number(configOverrides.daPercentOfBasic ?? config.da_percent_of_basic),
        hra_percent_of_basic: Number(configOverrides.hraPercentOfBasic ?? config.hra_percent_of_basic),
        pf_wage_ceiling: Number(configOverrides.pfWageCeiling ?? config.pf_wage_ceiling),
        employee_pf_percent: Number(configOverrides.employeePfPercent ?? config.employee_pf_percent),
        employer_pf_percent: Number(configOverrides.employerPfPercent ?? config.employer_pf_percent),
        enable_bonus: enableBonus ? 1 : Number(config.enable_bonus),
        bonus_percent_of_basic: Number(
          configOverrides.bonusPercentOfBasic ?? config.bonus_percent_of_basic
        ),
        enable_attendance_bonus: enableAttendanceBonus
          ? 1
          : Number(config.enable_attendance_bonus),
        attendance_bonus_amount: Number(
          configOverrides.attendanceBonusAmount ?? config.attendance_bonus_amount
        ),
        attendance_min_percent: Number(
          configOverrides.attendanceMinPercent ?? config.attendance_min_percent
        ),
        enable_gratuity: enableGratuity ? 1 : Number(config.enable_gratuity),
        gratuity_percent_of_basic: Number(
          configOverrides.gratuityPercentOfBasic ?? config.gratuity_percent_of_basic
        ),
        enable_esi:
          configOverrides.enableEsi != null
            ? configOverrides.enableEsi
              ? 1
              : 0
            : Number(config.enable_esi),
        employee_esi_percent: Number(
          configOverrides.employeeEsiPercent ?? config.employee_esi_percent ?? 0.75
        ),
        employer_esi_percent: Number(
          configOverrides.employerEsiPercent ?? config.employer_esi_percent ?? 3.25
        ),
        esi_wage_ceiling: Number(
          configOverrides.esiWageCeiling ?? config.esi_wage_ceiling ?? 21000
        )
      }
    : config;

  const calculation = calculateSalaryStructure({
    annualCtc: Number(annualCtc),
    config: merged,
    attendanceSummary: null,
    overrides: {
      enableBonus: Boolean(enableBonus || Number(merged.enable_bonus)),
      enableAttendanceBonus: Boolean(
        enableAttendanceBonus || Number(merged.enable_attendance_bonus)
      ),
      enableGratuity: Boolean(enableGratuity || Number(merged.enable_gratuity))
    }
  });
  res.json({ success: true, data: calculation });
});

export const getSalaryConfig = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'salary', 'view');
  const companyId = Number(req.query.companyId || req.params.companyId);
  if (!companyId) throw new AppError('companyId is required.', 400);
  await assertCompanyAccess(req.user, companyId);
  const config = await getSalaryConfiguration(companyId);
  res.json({ success: true, data: config });
});

export const updateSalaryConfig = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'salary', 'edit');
  const companyId = Number(req.body.companyId);
  if (!companyId) throw new AppError('companyId is required.', 400);
  await assertCompanyAccess(req.user, companyId);

  const basicPercent = Number(req.body.basicPercent);
  const daPercent = Number(req.body.daPercentOfBasic ?? 0);
  const hraPercent = Number(req.body.hraPercentOfBasic ?? 0);

  if ([basicPercent, daPercent, hraPercent].some((n) => Number.isNaN(n) || n < 0)) {
    throw new AppError('Percentages cannot be negative.', 400);
  }
  if (basicPercent > 100 || daPercent > 100 || hraPercent > 100) {
    throw new AppError(
      'Salary configuration percentages exceed the allowed structure. Please review Basic, HRA and other components.',
      400
    );
  }
  // Basic is % of CTC; HRA/DA are % of Basic — structural check on share of CTC
  const impliedShare = basicPercent + (basicPercent * hraPercent) / 100 + (basicPercent * daPercent) / 100;
  if (impliedShare > 100.01) {
    throw new AppError(
      'Salary configuration percentages exceed the allowed structure. Please review Basic, HRA and other components.',
      400
    );
  }

  const effectiveFrom = req.body.effectiveFrom || new Date().toISOString().slice(0, 10);
  const fields = {
    basic_percent: basicPercent,
    da_percent_of_basic: daPercent,
    hra_percent_of_basic: hraPercent,
    pf_wage_ceiling: Number(req.body.pfWageCeiling ?? 15000),
    employee_pf_percent: Number(req.body.employeePfPercent ?? 12),
    employer_pf_percent: Number(req.body.employerPfPercent ?? 13),
    enable_bonus: req.body.enableBonus ? 1 : 0,
    bonus_type: req.body.bonusType || 'ANNUAL',
    bonus_percent_of_basic: Number(req.body.bonusPercentOfBasic ?? 8.33),
    enable_attendance_bonus: req.body.enableAttendanceBonus ? 1 : 0,
    attendance_bonus_amount: Number(req.body.attendanceBonusAmount ?? 0),
    attendance_min_percent: Number(req.body.attendanceMinPercent ?? 95),
    enable_gratuity: req.body.enableGratuity ? 1 : 0,
    gratuity_percent_of_basic: Number(req.body.gratuityPercentOfBasic ?? 4.81),
    payroll_day_basis: req.body.payrollDayBasis || 'FIXED_30_DAYS',
    enable_pt: req.body.enablePt === false || req.body.enablePt === 0 ? 0 : 1,
    pt_amount: Number(req.body.ptAmount ?? 200),
    pt_threshold: Number(req.body.ptThreshold ?? 15000),
    enable_esi: req.body.enableEsi ? 1 : 0,
    employee_esi_percent: Number(req.body.employeeEsiPercent ?? 0.75),
    employer_esi_percent: Number(req.body.employerEsiPercent ?? 3.25),
    esi_wage_ceiling: Number(req.body.esiWageCeiling ?? 21000),
    company_address: req.body.companyAddress || COMPANY_ADDRESS_DEFAULT
  };

  const [existing] = await pool.query(
    `SELECT * FROM salary_configurations
     WHERE company_id = ? AND is_active = 1
     ORDER BY effective_from DESC LIMIT 1`,
    [companyId]
  );

  const previous = existing[0] || null;
  const sameEffective =
    previous &&
    String(previous.effective_from).slice(0, 10) === String(effectiveFrom).slice(0, 10);

  if (previous && sameEffective) {
    await pool.query(
      `UPDATE salary_configurations SET
         basic_percent = ?,
         da_percent_of_basic = ?,
         hra_percent_of_basic = ?,
         pf_wage_ceiling = ?,
         employee_pf_percent = ?,
         employer_pf_percent = ?,
         enable_bonus = ?,
         bonus_type = ?,
         bonus_percent_of_basic = ?,
         enable_attendance_bonus = ?,
         attendance_bonus_amount = ?,
         attendance_min_percent = ?,
         enable_gratuity = ?,
         gratuity_percent_of_basic = ?,
         payroll_day_basis = ?,
         enable_pt = ?,
         pt_amount = ?,
         pt_threshold = ?,
         enable_esi = ?,
         employee_esi_percent = ?,
         employer_esi_percent = ?,
         esi_wage_ceiling = ?,
         company_address = ?
       WHERE id = ?`,
      [
        fields.basic_percent,
        fields.da_percent_of_basic,
        fields.hra_percent_of_basic,
        fields.pf_wage_ceiling,
        fields.employee_pf_percent,
        fields.employer_pf_percent,
        fields.enable_bonus,
        fields.bonus_type,
        fields.bonus_percent_of_basic,
        fields.enable_attendance_bonus,
        fields.attendance_bonus_amount,
        fields.attendance_min_percent,
        fields.enable_gratuity,
        fields.gratuity_percent_of_basic,
        fields.payroll_day_basis,
        fields.enable_pt,
        fields.pt_amount,
        fields.pt_threshold,
        fields.enable_esi,
        fields.employee_esi_percent,
        fields.employer_esi_percent,
        fields.esi_wage_ceiling,
        fields.company_address,
        previous.id
      ]
    );
  } else {
    if (previous) {
      await pool.query(
        `UPDATE salary_configurations
         SET is_active = 0, effective_to = DATE_SUB(?, INTERVAL 1 DAY)
         WHERE id = ?`,
        [effectiveFrom, previous.id]
      );
    }
    await pool.query(
      `INSERT INTO salary_configurations (
         company_id, basic_percent, da_percent_of_basic, hra_percent_of_basic,
         pf_wage_ceiling, employee_pf_percent, employer_pf_percent,
         enable_bonus, bonus_type, bonus_percent_of_basic,
         enable_attendance_bonus, attendance_bonus_amount, attendance_min_percent,
         enable_gratuity, gratuity_percent_of_basic, payroll_day_basis,
         enable_pt, pt_amount, pt_threshold,
         enable_esi, employee_esi_percent, employer_esi_percent, esi_wage_ceiling,
         company_address, is_active, effective_from
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        companyId,
        fields.basic_percent,
        fields.da_percent_of_basic,
        fields.hra_percent_of_basic,
        fields.pf_wage_ceiling,
        fields.employee_pf_percent,
        fields.employer_pf_percent,
        fields.enable_bonus,
        fields.bonus_type,
        fields.bonus_percent_of_basic,
        fields.enable_attendance_bonus,
        fields.attendance_bonus_amount,
        fields.attendance_min_percent,
        fields.enable_gratuity,
        fields.gratuity_percent_of_basic,
        fields.payroll_day_basis,
        fields.enable_pt,
        fields.pt_amount,
        fields.pt_threshold,
        fields.enable_esi,
        fields.employee_esi_percent,
        fields.employer_esi_percent,
        fields.esi_wage_ceiling,
        fields.company_address,
        effectiveFrom
      ]
    );
  }

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'SALARY_CONFIG_UPDATED',
    entityType: 'salary_configurations',
    entityId: companyId,
    oldValues: previous
      ? {
          basic_percent: previous.basic_percent,
          hra_percent_of_basic: previous.hra_percent_of_basic,
          da_percent_of_basic: previous.da_percent_of_basic,
          enable_bonus: previous.enable_bonus,
          enable_attendance_bonus: previous.enable_attendance_bonus,
          enable_gratuity: previous.enable_gratuity
        }
      : null,
    newValues: { ...fields, effectiveFrom },
    ipAddress: req.ip
  });

  const config = await getSalaryConfiguration(companyId, effectiveFrom);
  res.json({ success: true, message: 'Salary configuration saved.', data: config });
});

export const listScopedPayslips = asyncHandler(async (req, res) => {
  if (!['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'].includes(req.user.role)) {
    throw new AppError('Not authorized to list employee payslips.', 403);
  }

  const companyId = req.query.companyId ? Number(req.query.companyId) : null;
  if (companyId) await assertCompanyAccess(req.user, companyId);
  const companyIds = companyId ? [companyId] : await getCompanyIdsForUser(req.user);
  if (!companyIds.length) return res.json({ success: true, data: [] });

  const runId = req.query.runId ? Number(req.query.runId) : null;
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
  const year = req.query.year ? Number(req.query.year) : null;
  const month = req.query.month ? Number(req.query.month) : null;
  const search = req.query.search ? String(req.query.search).trim() : '';

  let sql = `
    SELECT
      pr.id AS payslip_id,
      pr.payslip_number,
      pr.generated_at,
      run.period_year,
      run.period_month,
      run.status AS payroll_status,
      pri.gross_earnings,
      pri.other_deductions,
      pri.pf_employee,
      pri.esi_employee,
      pri.professional_tax,
      pri.net_pay,
      e.id AS employee_pk,
      e.employee_id AS emp_code,
      e.full_name,
      e.email,
      d.name AS department,
      pr.run_id,
      ped.id AS delivery_id,
      ped.status AS email_status,
      ped.sent_at AS email_sent_at,
      ped.last_error AS email_error
    FROM payslip_records pr
    INNER JOIN payroll_runs run ON run.id = pr.run_id
    INNER JOIN payroll_run_items pri ON pri.id = pr.run_item_id
    INNER JOIN employees e ON e.id = pr.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN payslip_email_deliveries ped ON ped.payslip_id = pr.id
    WHERE run.company_id IN (?)
  `;
  const params = [companyIds];

  if (runId) {
    sql += ' AND pr.run_id = ?';
    params.push(runId);
  }
  if (employeeId) {
    sql += ' AND pr.employee_id = ?';
    params.push(employeeId);
  }
  if (year) {
    sql += ' AND run.period_year = ?';
    params.push(year);
  }
  if (month) {
    sql += ' AND run.period_month = ?';
    params.push(month);
  }
  if (search) {
    sql += ' AND (e.full_name LIKE ? OR e.employee_id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY run.period_year DESC, run.period_month DESC, e.full_name ASC LIMIT 300';

  const [rows] = await pool.query(sql, params);
  res.json({ success: true, data: rows });
});

export const listPayrollRuns = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'payroll', 'view');
  const companyIds = await getCompanyIdsForUser(req.user);

  let sql = `
    SELECT pr.*, c.name AS company_name
    FROM payroll_runs pr
    INNER JOIN companies c ON c.id = pr.company_id
    WHERE 1=1
  `;
  const params = [];
  if (req.user.role !== 'SUPER_ADMIN') {
    if (!companyIds.length) return res.json({ success: true, data: [] });
    sql += ' AND pr.company_id IN (?)';
    params.push(companyIds);
  }
  sql += ' ORDER BY pr.period_year DESC, pr.period_month DESC, pr.id DESC';

  const [rows] = await pool.query(sql, params);
  res.json({ success: true, data: rows });
});

export const createPayrollRun = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'payroll', 'create');
  const companyId = Number(req.body.companyId);
  const periodYear = Number(req.body.periodYear);
  const periodMonth = Number(req.body.periodMonth);
  const workingDays = Number(req.body.workingDays || 26);

  await assertCompanyAccess(req.user, companyId);
  if (!periodYear || !periodMonth || periodMonth < 1 || periodMonth > 12) {
    throw new AppError('Valid period year and month are required.', 400);
  }

  const [result] = await pool.query(
    `INSERT INTO payroll_runs (
       company_id, period_year, period_month, status, working_days, created_by
     ) VALUES (?, ?, ?, 'DRAFT', ?, ?)`,
    [companyId, periodYear, periodMonth, workingDays, req.user.id]
  );

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'PAYROLL_RUN_CREATED',
    entityType: 'payroll_runs',
    entityId: result.insertId,
    newValues: { companyId, periodYear, periodMonth },
    ipAddress: req.ip
  });

  res.status(201).json({
    success: true,
    message: 'Payroll period created.',
    data: { id: result.insertId }
  });
});

export const getPayrollRun = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'payroll', 'view');
  const runId = Number(req.params.runId);
  const [runs] = await pool.query(
    `SELECT pr.*, c.name AS company_name
     FROM payroll_runs pr
     INNER JOIN companies c ON c.id = pr.company_id
     WHERE pr.id = ? LIMIT 1`,
    [runId]
  );
  if (!runs.length) throw new AppError('Payroll run not found.', 404);
  await assertCompanyAccess(req.user, runs[0].company_id);
  const run = runs[0];

  const [items] = await pool.query(
    `SELECT
       pri.*,
       e.full_name,
       e.employee_id AS emp_code,
       e.joining_date,
       e.designation,
       e.email,
       d.name AS department_name,
       ess.pf_applicable,
       EXISTS (
         SELECT 1 FROM employee_bank_details ub
         WHERE ub.employee_id = e.id AND ub.uan_number IS NOT NULL AND ub.uan_number <> ''
       ) AS has_uan,
       ps.id AS payslip_id,
       ps.payslip_number,
       ped.status AS email_status,
       ped.sent_at AS email_sent_at,
       ped.last_error AS email_error
     FROM payroll_run_items pri
     INNER JOIN employees e ON e.id = pri.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN employee_salary_structures ess ON ess.id = pri.structure_id
     LEFT JOIN payslip_records ps
       ON ps.id = (SELECT MAX(p2.id) FROM payslip_records p2 WHERE p2.run_item_id = pri.id)
     LEFT JOIN payslip_email_deliveries ped ON ped.payslip_id = ps.id
     WHERE pri.run_id = ?
     ORDER BY e.full_name`,
    [runId]
  );

  const [adjustments] = await pool.query(
    `SELECT * FROM payroll_adjustments WHERE run_id = ?`,
    [runId]
  );

  const periodStart = `${run.period_year}-${String(run.period_month).padStart(2, '0')}-01`;
  const periodEnd = `${run.period_year}-${String(run.period_month).padStart(2, '0')}-${String(
    new Date(run.period_year, run.period_month, 0).getDate()
  ).padStart(2, '0')}`;

  const [pendingCorrections] = await pool.query(
    `SELECT acr.id, acr.employee_id, e.employee_id AS emp_code, e.full_name, acr.correction_date
     FROM attendance_correction_requests acr
     INNER JOIN employees e ON e.id = acr.employee_id
     WHERE e.company_id = ?
       AND acr.status = 'PENDING'
       AND acr.correction_date BETWEEN ? AND ?`,
    [run.company_id, periodStart, periodEnd]
  );

  const issues = [];
  for (const item of items) {
    if (!item.structure_id || item.calculation_notes?.includes('Salary setup missing')) {
      issues.push({
        severity: 'BLOCKING',
        code: 'MISSING_SALARY_STRUCTURE',
        employeeId: item.employee_id,
        empCode: item.emp_code,
        fullName: item.full_name,
        message: 'Salary structure not configured',
        action: 'configure_salary'
      });
    } else if (item.net_pay == null || item.gross_earnings == null) {
      issues.push({
        severity: 'BLOCKING',
        code: 'CALCULATION_FAILED',
        employeeId: item.employee_id,
        empCode: item.emp_code,
        fullName: item.full_name,
        message: item.calculation_notes || 'Salary calculation incomplete',
        action: 'recalculate'
      });
    }
  }
  for (const corr of pendingCorrections) {
    issues.push({
      severity: 'WARNING',
      code: 'PENDING_ATTENDANCE_CORRECTION',
      employeeId: corr.employee_id,
      empCode: corr.emp_code,
      fullName: corr.full_name,
      message: `Pending attendance correction (${String(corr.correction_date).slice(0, 10)})`,
      action: 'review_correction',
      correctionId: corr.id
    });
  }

  const attendanceFinalized = await isAttendancePeriodFinalized(
    run.company_id,
    run.period_year,
    run.period_month
  );
  if (!attendanceFinalized && ['DRAFT', 'SUBMITTED'].includes(run.status)) {
    issues.unshift({
      severity: 'BLOCKING',
      code: 'ATTENDANCE_NOT_FINALIZED',
      employeeId: null,
      empCode: 'Attendance',
      message: `Attendance for ${String(run.period_month).padStart(2, '0')}/${run.period_year} is not finalized. Finalize it before approving payroll.`,
      action: 'finalize_attendance'
    });
  }
  for (const item of items) {
    if (!item.email) {
      issues.push({
        severity: 'WARNING',
        code: 'MISSING_EMAIL',
        employeeId: item.employee_id,
        empCode: item.emp_code,
        fullName: item.full_name,
        message: 'No email address — the payslip cannot be emailed on release.'
      });
    }
    if (item.structure_id && Number(item.pf_applicable ?? 1) && !Number(item.has_uan)) {
      issues.push({
        severity: 'WARNING',
        code: 'MISSING_UAN',
        employeeId: item.employee_id,
        empCode: item.emp_code,
        fullName: item.full_name,
        message: 'PF applies but no UAN is recorded — the payslip will show UAN as not available.',
        action: 'configure_salary'
      });
    }
  }

  const eligibleItems = items.map((item) => {
    const eligible =
      Boolean(item.structure_id) && item.net_pay != null && item.gross_earnings != null;
    return {
      ...item,
      pf_applicable: item.pf_applicable == null ? null : Boolean(Number(item.pf_applicable)),
      has_uan: Boolean(Number(item.has_uan)),
      eligibility: eligible ? 'ELIGIBLE' : 'BLOCKED'
    };
  });

  const deliveryCounts = eligibleItems.reduce(
    (acc, item) => {
      if (item.email_status) acc[item.email_status] = (acc[item.email_status] || 0) + 1;
      return acc;
    },
    {}
  );

  const totals = {
    employees: items.length,
    totalGross: items.reduce((s, i) => s + Number(i.gross_earnings || 0), 0),
    totalDeductions: items.reduce(
      (s, i) =>
        s +
        Number(i.pf_employee || 0) +
        Number(i.esi_employee || 0) +
        Number(i.professional_tax || 0) +
        Number(i.other_deductions || 0),
      0
    ),
    totalNet: items.reduce((s, i) => s + Number(i.net_pay || 0), 0),
    blockingIssues: issues.filter((i) => i.severity === 'BLOCKING').length,
    warningIssues: issues.filter((i) => i.severity === 'WARNING').length,
    eligible: eligibleItems.filter((i) => i.eligibility === 'ELIGIBLE').length,
    blocked: eligibleItems.filter((i) => i.eligibility === 'BLOCKED').length,
    missingEmail: eligibleItems.filter((i) => !i.email).length,
    payslips: eligibleItems.filter((i) => i.payslip_id).length
  };

  res.json({
    success: true,
    data: {
      run,
      items: eligibleItems,
      adjustments,
      issues,
      totals,
      attendance: { finalized: attendanceFinalized },
      deliveries: deliveryCounts
    }
  });
});

export const getPayrollDashboard = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'payroll', 'view');
  const companyIds = await getCompanyIdsForUser(req.user);
  const year = Number(req.query.year || new Date().getFullYear());
  const month = Number(req.query.month || new Date().getMonth() + 1);

  let companyFilter = '';
  const params = [];
  if (req.user.role !== 'SUPER_ADMIN') {
    if (!companyIds.length) {
      return res.json({
        success: true,
        data: {
          totalEmployees: 0,
          grossPayroll: 0,
          netPayroll: 0,
          pendingPayroll: 0,
          attendanceIssues: 0,
          approvedPayroll: 0
        }
      });
    }
    companyFilter = ' AND e.company_id IN (?)';
    params.push(companyIds);
  }

  const [empRows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM employees e
     WHERE e.status = 'ACTIVE' AND e.role <> 'SUPER_ADMIN' ${companyFilter}`,
    params
  );

  let runSql = `
    SELECT
      COALESCE(SUM(pri.gross_earnings), 0) AS gross_payroll,
      COALESCE(SUM(pri.net_pay), 0) AS net_payroll,
      SUM(CASE WHEN run.status IN ('DRAFT','SUBMITTED') THEN 1 ELSE 0 END) AS pending_items,
      SUM(CASE WHEN run.status IN ('APPROVED','LOCKED','PAID') THEN 1 ELSE 0 END) AS approved_items
    FROM payroll_run_items pri
    INNER JOIN payroll_runs run ON run.id = pri.run_id
    WHERE run.period_year = ? AND run.period_month = ?
  `;
  const runParams = [year, month];
  if (req.user.role !== 'SUPER_ADMIN') {
    runSql += ' AND run.company_id IN (?)';
    runParams.push(companyIds);
  }
  const [runAgg] = await pool.query(runSql, runParams);

  let pendingRunSql = `
    SELECT COUNT(*) AS cnt FROM payroll_runs run
    WHERE run.period_year = ? AND run.period_month = ?
      AND run.status IN ('DRAFT','SUBMITTED')
  `;
  const pendingParams = [year, month];
  if (req.user.role !== 'SUPER_ADMIN') {
    pendingRunSql += ' AND run.company_id IN (?)';
    pendingParams.push(companyIds);
  }
  const [pendingRuns] = await pool.query(pendingRunSql, pendingParams);

  let approvedRunSql = `
    SELECT COUNT(*) AS cnt FROM payroll_runs run
    WHERE run.period_year = ? AND run.period_month = ?
      AND run.status IN ('APPROVED','LOCKED','PAID')
  `;
  const approvedParams = [year, month];
  if (req.user.role !== 'SUPER_ADMIN') {
    approvedRunSql += ' AND run.company_id IN (?)';
    approvedParams.push(companyIds);
  }
  const [approvedRuns] = await pool.query(approvedRunSql, approvedParams);

  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(
    new Date(year, month, 0).getDate()
  ).padStart(2, '0')}`;

  let corrSql = `
    SELECT COUNT(*) AS cnt
    FROM attendance_correction_requests acr
    INNER JOIN employees e ON e.id = acr.employee_id
    WHERE acr.status = 'PENDING'
      AND acr.correction_date BETWEEN ? AND ?
  `;
  const corrParams = [periodStart, periodEnd];
  if (req.user.role !== 'SUPER_ADMIN') {
    corrSql += ' AND e.company_id IN (?)';
    corrParams.push(companyIds);
  }
  const [corrRows] = await pool.query(corrSql, corrParams);

  res.json({
    success: true,
    data: {
      periodYear: year,
      periodMonth: month,
      totalEmployees: Number(empRows[0]?.cnt || 0),
      grossPayroll: Number(runAgg[0]?.gross_payroll || 0),
      netPayroll: Number(runAgg[0]?.net_payroll || 0),
      pendingPayroll: Number(pendingRuns[0]?.cnt || 0),
      attendanceIssues: Number(corrRows[0]?.cnt || 0),
      approvedPayroll: Number(approvedRuns[0]?.cnt || 0)
    }
  });
});

export const calculatePayrollRun = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'payroll', 'edit');
  const runId = Number(req.params.runId);
  const [runs] = await pool.query(
    `SELECT * FROM payroll_runs WHERE id = ? LIMIT 1`,
    [runId]
  );
  if (!runs.length) throw new AppError('Payroll run not found.', 404);
  const run = runs[0];
  await assertCompanyAccess(req.user, run.company_id);

  if (!['DRAFT', 'SUBMITTED'].includes(run.status)) {
    throw new AppError('Only draft/submitted payroll can be recalculated.', 400);
  }

  await recalculatePayrollRunItems(run);

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'PAYROLL_CALCULATED',
    entityType: 'payroll_runs',
    entityId: runId,
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Payroll calculated.' });
});

async function transitionPayroll(req, res, nextStatus, action, dateField, byField) {
  await assertPermission(
    req.user,
    'payroll',
    nextStatus === 'APPROVED' || nextStatus === 'LOCKED' ? 'approve' : 'edit'
  );
  const runId = Number(req.params.runId);
  const [runs] = await pool.query(
    `SELECT * FROM payroll_runs WHERE id = ? LIMIT 1`,
    [runId]
  );
  if (!runs.length) throw new AppError('Payroll run not found.', 404);
  const run = runs[0];
  await assertCompanyAccess(req.user, run.company_id);

  const allowed = {
    SUBMITTED: ['DRAFT'],
    APPROVED: ['SUBMITTED'],
    LOCKED: ['APPROVED'],
    PAID: ['LOCKED'],
    DRAFT: ['LOCKED'] // controlled reopen
  };

  if (!allowed[nextStatus]?.includes(run.status)) {
    throw new AppError(
      `Cannot move payroll from ${run.status} to ${nextStatus}.`,
      400
    );
  }

  if (nextStatus === 'APPROVED' || nextStatus === 'SUBMITTED') {
    const [items] = await pool.query(
      `SELECT structure_id, net_pay, gross_earnings, calculation_notes, employee_id
       FROM payroll_run_items WHERE run_id = ?`,
      [runId]
    );
    if (!items.length) {
      throw new AppError(
        'Payroll has no calculated employees. Import attendance and calculate payroll first.',
        400
      );
    }
    const blocking = items.filter(
      (i) =>
        !i.structure_id ||
        i.net_pay == null ||
        i.gross_earnings == null ||
        (i.calculation_notes && String(i.calculation_notes).includes('Salary setup missing'))
    );
    if (blocking.length && nextStatus === 'APPROVED') {
      throw new AppError(
        `Cannot approve payroll: ${blocking.length} employee(s) have blocking issues (missing salary structure or incomplete calculation).`,
        400
      );
    }
    if (
      nextStatus === 'APPROVED' &&
      !(await isAttendancePeriodFinalized(run.company_id, run.period_year, run.period_month))
    ) {
      throw new AppError(
        `Cannot approve payroll: attendance for ${String(run.period_month).padStart(2, '0')}/${run.period_year} is not finalized. Finalize attendance, recalculate, then approve.`,
        400
      );
    }
  }

  if (nextStatus === 'DRAFT') {
    const reason = String(req.body.reason || '').trim();
    if (!reason) throw new AppError('Reopen reason is required.', 400);
    await pool.query(
      `UPDATE payroll_runs
       SET status = 'DRAFT', reopen_reason = ?, updated_at = NOW()
       WHERE id = ?`,
      [reason, runId]
    );
    await writeAuditLog({
      employeeId: req.user.id,
      action: 'PAYROLL_REOPENED',
      entityType: 'payroll_runs',
      entityId: runId,
      oldValues: { status: run.status },
      newValues: { status: 'DRAFT', reason },
      ipAddress: req.ip
    });
    return res.json({ success: true, message: 'Payroll reopened for correction.' });
  }

  await pool.query(
    `UPDATE payroll_runs
     SET status = ?, ${byField} = ?, ${dateField} = NOW()
     WHERE id = ?`,
    [nextStatus, req.user.id, runId]
  );

  await writeAuditLog({
    employeeId: req.user.id,
    action,
    entityType: 'payroll_runs',
    entityId: runId,
    oldValues: { status: run.status },
    newValues: { status: nextStatus },
    ipAddress: req.ip
  });

  await notifyRoleHolders({
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR'],
    actorId: req.user.id,
    companyId: run.company_id,
    type: `PAYROLL_${nextStatus}`,
    title: `Payroll ${nextStatus.toLowerCase()}`,
    message: `Payroll ${run.period_month}/${run.period_year} is now ${nextStatus}.`,
    referenceType: 'PAYROLL',
    referenceId: runId
  });

  res.json({ success: true, message: `Payroll ${nextStatus.toLowerCase()}.` });
}

export const submitPayrollRun = asyncHandler(async (req, res) => {
  await transitionPayroll(req, res, 'SUBMITTED', 'PAYROLL_SUBMITTED', 'submitted_at', 'submitted_by');
});

export const approvePayrollRun = asyncHandler(async (req, res) => {
  await transitionPayroll(req, res, 'APPROVED', 'PAYROLL_APPROVED', 'approved_at', 'approved_by');
});

export const lockPayrollRun = asyncHandler(async (req, res) => {
  await transitionPayroll(req, res, 'LOCKED', 'PAYROLL_LOCKED', 'locked_at', 'locked_by');
});

export const markPayrollPaid = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'payroll', 'approve');
  const runId = Number(req.params.runId);
  const [runs] = await pool.query(
    `SELECT * FROM payroll_runs WHERE id = ? LIMIT 1`,
    [runId]
  );
  if (!runs.length) throw new AppError('Payroll run not found.', 404);
  const run = runs[0];
  await assertCompanyAccess(req.user, run.company_id);

  if (run.status !== 'LOCKED') {
    throw new AppError('Only locked payroll can be released.', 400);
  }

  const [released] = await pool.query(
    `UPDATE payroll_runs
     SET status = 'PAID', paid_by = ?, paid_at = NOW()
     WHERE id = ? AND status = 'LOCKED'`,
    [req.user.id, runId]
  );
  if (!released.affectedRows) {
    throw new AppError('This payroll run was already released.', 409);
  }

  const [items] = await pool.query(
    `SELECT id, employee_id FROM payroll_run_items WHERE run_id = ?`,
    [runId]
  );

  for (const item of items) {
    const payslipNumber = `PS-${runId}-${item.employee_id}-${Date.now()}`;
    await pool.query(
      `INSERT IGNORE INTO payslip_records (
         run_id, run_item_id, employee_id, payslip_number, generated_by
       ) VALUES (?, ?, ?, ?, ?)`,
      [runId, item.id, item.employee_id, payslipNumber, req.user.id]
    );

    await createNotification({
      recipientId: item.employee_id,
      actorId: req.user.id,
      type: 'PAYSLIP_GENERATED',
      title: 'Payslip available',
      message: 'Your payslip has been generated.',
      referenceType: 'PAYROLL',
      referenceId: runId
    });
  }

  await createDeliveriesForRun(runId);
  const delivery = await listRunDeliveries(runId);
  processRunDeliveriesInBackground(runId);

  await writeAuditLog({
    employeeId: req.user.id,
    action: 'PAYROLL_PAID',
    entityType: 'payroll_runs',
    entityId: runId,
    oldValues: { status: 'LOCKED' },
    newValues: {
      status: 'PAID',
      payslips: items.length,
      emailsQueued: delivery.counts.PENDING,
      emailsSkipped: delivery.counts.SKIPPED
    },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: `Payroll released. ${items.length} payslip(s) generated; ${delivery.counts.PENDING} email(s) are being sent.`,
    data: { payslips: items.length, delivery: delivery.counts }
  });
});

async function loadRunForDelivery(req, runId) {
  const [runs] = await pool.query(`SELECT * FROM payroll_runs WHERE id = ? LIMIT 1`, [runId]);
  if (!runs.length) throw new AppError('Payroll run not found.', 404);
  await assertCompanyAccess(req.user, runs[0].company_id);
  return runs[0];
}

export const getRunEmailDeliveries = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'payroll', 'view');
  const runId = Number(req.params.runId);
  await loadRunForDelivery(req, runId);
  res.json({ success: true, data: await listRunDeliveries(runId) });
});

export const retryRunEmailDeliveries = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'payroll', 'approve');
  const runId = Number(req.params.runId);
  const run = await loadRunForDelivery(req, runId);
  if (run.status !== 'PAID') throw new AppError('Payslip emails are sent only after release.', 400);
  const requeued = await requeueFailedDeliveries(runId);
  processRunDeliveriesInBackground(runId);
  await writeAuditLog({
    employeeId: req.user.id,
    action: 'PAYSLIP_EMAIL_RETRY',
    entityType: 'payroll_runs',
    entityId: runId,
    newValues: { requeued },
    ipAddress: req.ip
  });
  res.json({
    success: true,
    message: requeued ? `Retrying ${requeued} payslip email(s).` : 'No failed payslip emails to retry.',
    data: await listRunDeliveries(runId)
  });
});

export const resendPayslipEmail = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'payroll', 'edit');
  const runId = Number(req.params.runId);
  const deliveryId = Number(req.params.deliveryId);
  await loadRunForDelivery(req, runId);
  const [rows] = await pool.query(
    `SELECT id FROM payslip_email_deliveries WHERE id = ? AND run_id = ? LIMIT 1`,
    [deliveryId, runId]
  );
  if (!rows.length) throw new AppError('Email delivery not found for this payroll run.', 404);
  if (!(await requeueDelivery(deliveryId))) {
    throw new AppError('This payslip email is being sent right now. Try again in a moment.', 409);
  }
  processRunDeliveriesInBackground(runId);
  await writeAuditLog({
    employeeId: req.user.id,
    action: 'PAYSLIP_EMAIL_RESENT',
    entityType: 'payslip_email_deliveries',
    entityId: deliveryId,
    ipAddress: req.ip
  });
  res.json({ success: true, message: 'Payslip email queued for resend.' });
});

export const reopenPayrollRun = asyncHandler(async (req, res) => {
  await transitionPayroll(req, res, 'DRAFT', 'PAYROLL_REOPENED', 'submitted_at', 'submitted_by');
});

export const listMyPayslips = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT
       pr.id AS payslip_id,
       pr.payslip_number,
       pr.generated_at,
       run.period_year,
       run.period_month,
       run.status AS payroll_status,
       pri.gross_earnings,
       pri.pf_employee,
       pri.esi_employee,
       pri.professional_tax,
       pri.net_pay
     FROM payslip_records pr
     INNER JOIN payroll_runs run ON run.id = pr.run_id
     INNER JOIN payroll_run_items pri ON pri.id = pr.run_item_id
     WHERE pr.employee_id = ? AND run.status = 'PAID'
     ORDER BY run.period_year DESC, run.period_month DESC`,
    [req.user.id]
  );
  res.json({ success: true, data: rows });
});

export const getPayslip = asyncHandler(async (req, res) => {
  const payslipId = Number(req.params.payslipId);
  const payslip = await loadPayslipRowById(payslipId);
  if (!payslip) throw new AppError('Payslip not found.', 404);

  const isOwner = Number(payslip.employee_id) === Number(req.user.id);
  const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'].includes(req.user.role);
  if (!isOwner && !isAdmin) {
    throw new AppError('You cannot view this payslip.', 403);
  }
  if (isAdmin && !isOwner) await assertCompanyAccess(req.user, payslip.company_id);
  // Employees only see payslips once payroll has been released.
  if (!isAdmin && payslip.payroll_status !== 'PAID') {
    throw new AppError('Payslip not found.', 404);
  }

  // Super Admin may open by ID for ops, but dedicated Employee Payslips list is blocked elsewhere
  if (req.query.download === '1') {
    await writeAuditLog({
      employeeId: req.user.id,
      action: 'PAYSLIP_DOWNLOADED',
      entityType: 'payslip_records',
      entityId: payslipId,
      newValues: { role: req.user.role },
      ipAddress: req.ip
    });
  }

  res.json({ success: true, data: shapePayslip(payslip) });
});

/**
 * One employee's payslip inside a payroll run, identified by run + employee so the review
 * screen can preview or download it before release as well as after.
 */
export const getRunEmployeePayslip = asyncHandler(async (req, res) => {
  await assertPermission(req.user, 'payroll', 'view');
  const runId = Number(req.params.runId);
  const employeeId = Number(req.params.employeeId);
  const row = await loadPayslipRowForRunEmployee(runId, employeeId);
  if (!row) throw new AppError('This employee is not part of the payroll run.', 404);
  await assertCompanyAccess(req.user, row.company_id);
  if (row.net_pay == null) {
    throw new AppError('Payroll for this employee is not calculated yet. Resolve the payroll issues first.', 409);
  }

  if (req.query.download === '1') {
    await writeAuditLog({
      employeeId: req.user.id,
      action: 'PAYSLIP_DOWNLOADED',
      entityType: row.id ? 'payslip_records' : 'payroll_run_items',
      entityId: row.id || row.run_item_id,
      newValues: { role: req.user.role, runId, employeeId, preview: !row.id },
      ipAddress: req.ip
    });
  }

  res.json({ success: true, data: shapePayslip(row) });
});
