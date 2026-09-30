import { pool } from '../config/database.js';
import {
  calculateEmployeeSalary,
  getSalaryConfiguration
} from './salaryCalculationService.js';

export const DEFAULT_SALARY_COMPONENTS = [
  { code: 'BASIC', name: 'Basic', contribution_type: 'NONE', is_deduction: 0, sort_order: 1 },
  { code: 'DA', name: 'DA', contribution_type: 'NONE', is_deduction: 0, sort_order: 2 },
  { code: 'HRA', name: 'HRA', contribution_type: 'NONE', is_deduction: 0, sort_order: 3 },
  { code: 'SPECIAL_ALLOWANCE', name: 'Special Allowance', contribution_type: 'NONE', is_deduction: 0, sort_order: 4 },
  { code: 'BONUS', name: 'Bonus', contribution_type: 'NONE', is_deduction: 0, sort_order: 5 },
  { code: 'ATTENDANCE_BONUS', name: 'Attendance Bonus', contribution_type: 'NONE', is_deduction: 0, sort_order: 6 },
  { code: 'PF_EMPLOYEE', name: 'PF (Employee)', contribution_type: 'EMPLOYEE', is_deduction: 1, sort_order: 10 },
  { code: 'PF_EMPLOYER', name: 'PF (Employer)', contribution_type: 'EMPLOYER', is_deduction: 0, sort_order: 11 },
  { code: 'GRATUITY', name: 'Gratuity', contribution_type: 'EMPLOYER', is_deduction: 0, sort_order: 12 },
  { code: 'PT', name: 'Professional Tax', contribution_type: 'EMPLOYEE', is_deduction: 1, sort_order: 14 }
];

export async function getActiveSalaryStructure(employeeId, asOfDate = null) {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const [rows] = await pool.query(
    `SELECT *
     FROM employee_salary_structures
     WHERE employee_id = ?
       AND status = 'ACTIVE'
       AND effective_date <= ?
     ORDER BY effective_date DESC
     LIMIT 1`,
    [employeeId, date]
  );
  return rows[0] || null;
}

export async function getStructureComponents(structureId) {
  const [rows] = await pool.query(
    `SELECT *
     FROM salary_components
     WHERE structure_id = ?
     ORDER BY sort_order, id`,
    [structureId]
  );
  return rows;
}

export async function getPayableDays(employeeId, year, month) {
  const { getAttendanceSummary } = await import('./salaryCalculationService.js');
  const summary = await getAttendanceSummary(employeeId, year, month);
  return summary.paidDays;
}

/**
 * Automatic payroll item calculation from CTC + attendance + salary config.
 */
export async function calculateEmployeePayrollItem({
  employeeId,
  companyId,
  periodYear,
  periodMonth,
  workingDays
}) {
  const asOf = `${periodYear}-${String(periodMonth).padStart(2, '0')}-01`;
  const structure = await getActiveSalaryStructure(employeeId, asOf);

  if (!structure) {
    return {
      employeeId,
      structureId: null,
      ctc: null,
      gross_earnings: null,
      pf_employee: null,
      pf_employer: null,
      esi_employee: 0,
      esi_employer: 0,
      professional_tax: null,
      other_deductions: 0,
      net_pay: null,
      payable_days: 0,
      calculation_notes: 'Salary setup missing. Enter Annual CTC for this employee.',
      component_snapshot: []
    };
  }

  const resolvedCompanyId = companyId || structure.company_id;
  const overrides = {
    enableBonus: Boolean(Number(structure.enable_bonus)),
    enableAttendanceBonus: Boolean(Number(structure.enable_attendance_bonus)),
    enableGratuity: Boolean(Number(structure.enable_gratuity)),
    workingDays
  };

  try {
    const calc = await calculateEmployeeSalary({
      employeeId,
      annualCtc: Number(structure.ctc),
      companyId: resolvedCompanyId,
      periodYear,
      periodMonth,
      overrides
    });

    return {
      employeeId,
      structureId: structure.id,
      ctc: calc.annualCtc,
      gross_earnings: calc.grossSalary,
      pf_employee: calc.employeePf,
      pf_employer: calc.employerPf,
      esi_employee: calc.employeeEsi ?? 0,
      esi_employer: calc.employerEsi ?? 0,
      professional_tax: calc.professionalTax,
      other_deductions: calc.lopAmount,
      net_pay: calc.netPay,
      payable_days: calc.paidDays,
      calculation_notes: null,
      component_snapshot: calc
    };
  } catch (error) {
    return {
      employeeId,
      structureId: structure.id,
      ctc: Number(structure.ctc),
      gross_earnings: null,
      pf_employee: null,
      pf_employer: null,
      esi_employee: 0,
      esi_employer: 0,
      professional_tax: null,
      other_deductions: 0,
      net_pay: null,
      payable_days: 0,
      calculation_notes: error.message || 'Salary calculation failed.',
      component_snapshot: []
    };
  }
}

/**
 * Rebuilds all items of a payroll run for the company's active employees.
 * Used by the Calculate Payroll action and the monthly auto-payroll job.
 */
export async function recalculatePayrollRunItems(run) {
  const [employees] = await pool.query(
    `SELECT id FROM employees
     WHERE company_id = ? AND status = 'ACTIVE' AND role <> 'SUPER_ADMIN'`,
    [run.company_id]
  );

  await pool.query(`DELETE FROM payroll_run_items WHERE run_id = ?`, [run.id]);

  let missingSalary = 0;
  let failed = 0;
  for (const employee of employees) {
    const calc = await calculateEmployeePayrollItem({
      employeeId: employee.id,
      companyId: run.company_id,
      periodYear: run.period_year,
      periodMonth: run.period_month,
      workingDays: run.working_days
    });

    if (!calc.structureId) missingSalary += 1;
    else if (calc.net_pay == null) failed += 1;

    await pool.query(
      `INSERT INTO payroll_run_items (
         run_id, employee_id, structure_id, payable_days, ctc, gross_earnings,
         pf_employee, pf_employer, esi_employee, esi_employer, professional_tax,
         other_deductions, net_pay, calculation_notes, component_snapshot
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.id,
        employee.id,
        calc.structureId,
        calc.payable_days ?? 0,
        calc.ctc,
        calc.gross_earnings,
        calc.pf_employee,
        calc.pf_employer,
        calc.esi_employee,
        calc.esi_employer,
        calc.professional_tax,
        calc.other_deductions,
        calc.net_pay,
        calc.calculation_notes,
        JSON.stringify(calc.component_snapshot)
      ]
    );
  }

  return { employees: employees.length, missingSalary, failed };
}

export { getSalaryConfiguration };
