import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSalaryStructure, salaryResultToStoredComponents } from '../src/services/salaryCalculationService.js';
import { maskUan } from '../src/utils/maskSensitive.js';
import { buildPayslipDocument, payslipFileName } from '../../frontend/src/services/payslip.js';

const CONFIG = {
  basic_percent: 40,
  da_percent_of_basic: 0,
  hra_percent_of_basic: 50,
  pf_wage_ceiling: 15000,
  employee_pf_percent: 12,
  employer_pf_percent: 13,
  enable_bonus: 0,
  enable_attendance_bonus: 0,
  enable_gratuity: 0,
  payroll_day_basis: 'FIXED_30_DAYS',
  enable_pt: 0,
  enable_esi: 0
};

describe('PF applicability in the salary engine', () => {
  it('applies PF by default, capped at the PF wage ceiling', () => {
    const calc = calculateSalaryStructure({ annualCtc: 600000, config: CONFIG });
    assert.equal(calc.pfApplicable, true);
    assert.equal(calc.pfBase, 15000);
    assert.equal(calc.employeePf, 1800);
    assert.equal(calc.employerPf, 1950);
  });

  it('removes employee and employer PF when PF is not applicable, keeping CTC reconciled', () => {
    const withPf = calculateSalaryStructure({ annualCtc: 600000, config: CONFIG });
    const noPf = calculateSalaryStructure({ annualCtc: 600000, config: CONFIG, overrides: { pfApplicable: false } });
    assert.equal(noPf.pfApplicable, false);
    assert.equal(noPf.employeePf, 0);
    assert.equal(noPf.employerPf, 0);
    assert.equal(noPf.pfBase, 0);
    assert.equal(noPf.specialAllowance, withPf.specialAllowance + withPf.employerPf);
    assert.equal(noPf.netPay, withPf.netPay + withPf.employerPf + withPf.employeePf);
    const stored = salaryResultToStoredComponents(noPf);
    assert.equal(stored.find((c) => c.component_code === 'PF_EMPLOYEE').amount_status, 'NOT_APPLICABLE');
    assert.equal(stored.find((c) => c.component_code === 'PF_EMPLOYER').amount_status, 'NOT_APPLICABLE');
  });
});

describe('payslip identifiers', () => {
  it('masks only well-formed 12-digit UANs', () => {
    assert.equal(maskUan('1002 0030 4005'), 'XXXXXXXX4005');
    assert.equal(maskUan('12345'), null);
    assert.equal(maskUan(null), null);
  });

  it('names payslip PDFs EMPCODE_Month_Year_Payslip.pdf', () => {
    assert.equal(
      payslipFileName({ emp_code: 'EMP00125', period_month: 9, period_year: 2026 }),
      'EMP00125_September_2026_Payslip.pdf'
    );
    assert.equal(payslipFileName({ emp_code: 'A/B 1', period_month: 13 }), 'AB1_Payslip_Payslip.pdf');
  });

  it('shows UAN and PF wage on the payslip only when PF applies', () => {
    const base = { emp_code: 'EMP1', full_name: 'Test', period_month: 9, period_year: 2026, net_pay: 100, gross_earnings: 100 };
    const flat = (doc) => doc.employee.flat().filter(Boolean);
    const withPf = flat(buildPayslipDocument({ ...base, uan_masked: 'XXXXXXXX4005', pf_wage: 15000 }));
    assert.deepEqual(withPf.find(([label]) => label === 'UAN'), ['UAN', 'XXXXXXXX4005']);
    assert.ok(withPf.some(([label, value]) => label === 'PF Wage' && value.includes('15,000.00')));
    const noPf = flat(buildPayslipDocument({ ...base, pf_applicable: false }));
    assert.deepEqual(noPf.find(([label]) => label === 'PF'), ['PF', 'Not applicable']);
    assert.equal(noPf.find(([label]) => label === 'UAN'), undefined);
  });

  it('labels unreleased payslips as previews', () => {
    const doc = buildPayslipDocument({ emp_code: 'EMP1', period_month: 9, period_year: 2026, is_preview: true });
    assert.deepEqual(doc.header.meta.find(([label]) => label === 'Payslip No.'), ['Payslip No.', 'Preview — not released']);
  });
});
