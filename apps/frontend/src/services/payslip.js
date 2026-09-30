import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { COMPANY_LOGO_ASPECT, COMPANY_LOGO_URL } from '../config/branding.js';

export { COMPANY_LOGO_URL };

export const COMPANY_NAME_DEFAULT = 'SRSB Workforce Solutions';
export const COMPANY_ADDRESS_DEFAULT =
  'No.59(228/B), 55th Cross, 3rd Block, Rajajinagar, Bangalore, Karnataka, India (Landmark: Behind Ram Mandir Temple)';
export function formatCurrencyINR(n) {
  return n == null || Number.isNaN(Number(n))
    ? '—'
    : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function amountInWords(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '';
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const totalPaise = Math.round(Math.abs(Number(amount)) * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  if (totalPaise === 0) return 'Zero Rupees Only';

  function twoDigits(n) {
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`;
  }
  function threeDigits(n) {
    if (n < 100) return twoDigits(n);
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${twoDigits(n % 100)}` : ''}`;
  }

  let n = rupees;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const rest = n;
  const parts = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  const rupeeWords = parts.length ? `${parts.join(' ')} Rupees` : '';
  const paiseWords = paise ? `${twoDigits(paise)} Paise` : '';
  const words = [rupeeWords, paiseWords].filter(Boolean).join(' and ');
  return `${Number(amount) < 0 ? 'Minus ' : ''}${words} Only`;
}

export function loadCompanyLogoDataUrl() {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = COMPANY_LOGO_URL;
  });
}

function toNumber(value) {
  return value == null || value === '' || Number.isNaN(Number(value)) ? null : Number(value);
}

function parseSnapshotValue(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sum(rows) {
  return Number(rows.reduce((s, r) => s + Number(r.amount || 0), 0).toFixed(2));
}

/**
 * Normalises a payslip record (GET /payroll/payslips/:id), a payroll run item,
 * or a raw engine calculation into one earnings/deductions view.
 * Earnings are full-month component values; attendance shortfall appears as
 * a Loss of Pay deduction so the two columns reconcile to net pay.
 */
export function buildPayslipFigures(source) {
  if (!source) return null;
  const bd =
    parseSnapshotValue(source.breakdown) ||
    parseSnapshotValue(source.component_snapshot) ||
    (source.basic != null ? source : null);
  const hasBreakdown = Boolean(bd && bd.basic != null);

  const paidDays = toNumber(source.payable_days) ?? toNumber(bd?.paidDays);
  const lopDays = toNumber(source.lop_days) ?? toNumber(bd?.lopDays);
  const basisDays = toNumber(bd?.basisDays);

  let earnings;
  let deductions;
  if (hasBreakdown) {
    const esiNote =
      bd.esiStatus === 'DISABLED'
        ? 'disabled'
        : bd.esiStatus === 'ABOVE_CEILING'
          ? 'above ceiling'
          : null;
    earnings = [
      { label: 'Basic', amount: toNumber(bd.basic) },
      { label: 'DA', amount: toNumber(bd.da) },
      { label: 'HRA', amount: toNumber(bd.hra) },
      { label: 'Special Allowance', amount: toNumber(bd.specialAllowance) },
      {
        label: 'Bonus',
        amount: toNumber(bd.bonus),
        note: bd.configSnapshot && !bd.configSnapshot.enable_bonus ? 'disabled' : null
      },
      {
        label: 'Attendance Bonus',
        amount: toNumber(bd.attendanceBonus),
        note:
          bd.configSnapshot && !bd.configSnapshot.enable_attendance_bonus
            ? 'disabled'
            : bd.attendanceBonusEligible && bd.attendanceBonusEligible !== 'ELIGIBLE'
              ? String(bd.attendanceBonusEligible).toLowerCase().replace(/_/g, ' ')
              : null
      }
    ];
    deductions = [
      { label: 'Provident Fund (PF)', amount: toNumber(bd.employeePf) },
      { label: 'ESI', amount: toNumber(bd.employeeEsi) ?? 0, note: esiNote },
      { label: 'Professional Tax', amount: toNumber(bd.professionalTax) },
      {
        label: lopDays != null ? `Loss of Pay (${lopDays} day${lopDays === 1 ? '' : 's'})` : 'Loss of Pay',
        amount: toNumber(bd.lopAmount) ?? 0
      }
    ];
  } else {
    earnings = [{ label: 'Gross Earnings (after LOP)', amount: toNumber(source.gross_earnings) }];
    deductions = [
      { label: 'Provident Fund (PF)', amount: toNumber(source.pf_employee) },
      { label: 'ESI', amount: toNumber(source.esi_employee) ?? 0 },
      { label: 'Professional Tax', amount: toNumber(source.professional_tax) }
    ];
  }

  const totalEarnings = sum(earnings);
  const totalDeductions = sum(deductions);
  const netPay =
    toNumber(source.net_pay) ?? toNumber(bd?.netPay) ?? Number((totalEarnings - totalDeductions).toFixed(2));

  const employer = hasBreakdown
    ? [
        { label: 'Employer PF', amount: toNumber(source.pf_employer) ?? toNumber(bd.employerPf) },
        { label: 'Employer ESI', amount: toNumber(source.esi_employer) ?? toNumber(bd.employerEsi) ?? 0 },
        { label: 'Gratuity', amount: toNumber(bd.gratuity) ?? 0 }
      ]
    : [];

  return {
    hasBreakdown,
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    netPay,
    grossSalary: toNumber(source.gross_earnings) ?? toNumber(bd?.grossSalary),
    annualCtc: toNumber(bd?.annualCtc) ?? toNumber(source.ctc),
    monthlyCtc: toNumber(bd?.monthlyCtc),
    employer,
    paidDays,
    lopDays,
    basisDays
  };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const NOT_PROVIDED = 'Not provided';
const NOT_RECORDED = 'Not recorded';
const DAY_BASIS_LABELS = {
  CALENDAR_DAYS: 'calendar days',
  WORKING_DAYS: 'working days',
  FIXED_30_DAYS: 'fixed 30-day month'
};
const EARNING_LABELS = {
  BASIC: 'Basic Salary',
  DA: 'Dearness Allowance (DA)',
  HRA: 'House Rent Allowance (HRA)',
  SPECIAL_ALLOWANCE: 'Special Allowance',
  BONUS: 'Bonus',
  ATTENDANCE_BONUS: 'Attendance Bonus'
};

function parseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatPayslipDate(value) {
  const date = parseDate(value);
  if (!date) return null;
  return `${String(date.getDate()).padStart(2, '0')} ${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

export function formatPayslipAmount(value) {
  const n = toNumber(value);
  if (n == null) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDays(value) {
  const n = toNumber(value);
  if (n == null) return null;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function textOr(value, fallback = NOT_PROVIDED) {
  const text = value == null ? '' : String(value).trim();
  return text || fallback;
}

// A masked value may expose at most four digits; anything else is withheld.
function maskedOr(value) {
  const text = value == null ? '' : String(value).trim();
  if (!text || text.replace(/\D/g, '').length > 4) return NOT_PROVIDED;
  return text;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function sameAmount(a, b) {
  return Math.abs(round2(a) - round2(b)) < 0.005;
}

function pairsToRows(pairs) {
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) rows.push([pairs[i], pairs[i + 1] || null]);
  return rows;
}

/**
 * Maps a finalized payslip (GET /payroll/payslips/:id) into the sections shown on
 * screen and in the PDF. Amounts are taken from the payroll run item as finalized;
 * nothing is recalculated. The component snapshot only supplies the itemised split.
 */
export function buildPayslipDocument(payslip, { companyAddressDefault = COMPANY_ADDRESS_DEFAULT } = {}) {
  if (!payslip) return null;
  const snapshot = parseSnapshotValue(payslip.breakdown) || parseSnapshotValue(payslip.component_snapshot);
  const bd = snapshot && !Array.isArray(snapshot) && snapshot.grossSalary != null ? snapshot : null;
  const components = Array.isArray(bd?.components) ? bd.components : [];
  const byCode = Object.fromEntries(components.map((c) => [c.code, c]));
  const attendance = bd?.attendanceSummary || null;

  const year = Number(payslip.period_year);
  const month = Number(payslip.period_month);
  const hasPeriod = year > 0 && month >= 1 && month <= 12;
  const periodLabel = hasPeriod ? `${MONTH_NAMES[month - 1]} ${year}` : '—';
  const periodRange = hasPeriod
    ? `${formatPayslipDate(new Date(year, month - 1, 1))} – ${formatPayslipDate(new Date(year, month, 0))}`
    : null;
  const daysInMonth = hasPeriod ? new Date(year, month, 0).getDate() : null;

  const isPaid = (payslip.payment_status || payslip.payroll_status) === 'PAID';
  const paymentDate = isPaid ? formatPayslipDate(payslip.payment_date || payslip.paid_at) : null;

  const header = {
    companyName: textOr(payslip.company_name, COMPANY_NAME_DEFAULT),
    address: textOr(payslip.company_address, companyAddressDefault),
    contacts: [
      payslip.company_phone ? `Phone: ${payslip.company_phone}` : null,
      payslip.company_email ? `Email: ${payslip.company_email}` : null,
      payslip.company_website ? `Web: ${payslip.company_website}` : null
    ].filter(Boolean),
    title: 'Payslip',
    periodLabel,
    meta: [
      ['Pay Period', periodRange || periodLabel],
      ['Payslip No.', textOr(payslip.payslip_number, '—')],
      ['Payroll Run ID', payslip.run_id ? `#${payslip.run_id}` : '—'],
      ['Generated On', formatPayslipDate(payslip.generated_at) || NOT_RECORDED],
      ['Payment Date', paymentDate || NOT_RECORDED]
    ]
  };

  const employee = pairsToRows([
    ['Employee ID', textOr(payslip.emp_code)],
    ['Employee Name', textOr(payslip.full_name)],
    ['Designation', textOr(payslip.designation)],
    ['Department', textOr(payslip.department)],
    ['Work Location', textOr(payslip.work_location)],
    ['Date of Joining', formatPayslipDate(payslip.joining_date) || NOT_PROVIDED],
    ['PAN', maskedOr(payslip.pan_masked)],
    ['Aadhaar', maskedOr(payslip.aadhaar_masked)]
  ]);

  const paidDays = formatDays(payslip.payable_days) ?? NOT_RECORDED;
  const attendanceRows = bd
    ? [
        ['Calendar Days', formatDays(attendance?.calendarDays ?? daysInMonth) ?? NOT_RECORDED],
        [
          'Payable Days Basis',
          bd.basisDays != null
            ? `${formatDays(bd.basisDays)}${DAY_BASIS_LABELS[bd.configSnapshot?.payroll_day_basis] ? ` (${DAY_BASIS_LABELS[bd.configSnapshot.payroll_day_basis]})` : ''}`
            : NOT_RECORDED
        ],
        ['Paid Days', paidDays],
        ['Paid Leave Days', attendance ? formatDays(attendance.paidLeave) ?? NOT_RECORDED : NOT_RECORDED],
        ['LOP Days', formatDays(bd.lopDays) ?? NOT_RECORDED]
      ]
    : [
        ['Calendar Days', formatDays(daysInMonth) ?? NOT_RECORDED],
        ['Working Days (Run)', formatDays(payslip.working_days) ?? NOT_RECORDED],
        ['Paid Days', paidDays],
        ['Paid Leave Days', NOT_RECORDED],
        ['LOP Days', NOT_RECORDED]
      ];

  const gross = toNumber(payslip.gross_earnings) ?? toNumber(bd?.grossSalary);
  const net = toNumber(payslip.net_pay) ?? toNumber(bd?.netPay);

  const earningComponents = components.filter(
    (c) =>
      c.type === 'EARNING' &&
      c.enabled !== false &&
      (Number(c.amount) !== 0 || Number(c.monthly) !== 0 || c.enabled === true)
  );
  const showRate = earningComponents.length > 0;
  const earningRows = showRate
    ? earningComponents.map((c) => ({
        label: EARNING_LABELS[c.code] || c.name || c.code,
        rate: toNumber(c.monthly),
        amount: toNumber(c.amount),
        note:
          c.code === 'ATTENDANCE_BONUS' && c.eligibility && c.eligibility !== 'ELIGIBLE'
            ? String(c.eligibility).toLowerCase().replace(/_/g, ' ')
            : null
      }))
    : [{ label: 'Gross Earnings', rate: null, amount: gross, note: null }];

  const pf = toNumber(payslip.pf_employee);
  const esi = toNumber(payslip.esi_employee) ?? 0;
  const pt = toNumber(payslip.professional_tax) ?? 0;
  const deductionRows = [];
  if (pf != null && (pf > 0 || byCode.PF_EMPLOYEE || !bd)) {
    deductionRows.push({ label: 'Employee Provident Fund (EPF)', amount: pf });
  }
  if (esi > 0) deductionRows.push({ label: 'Employee State Insurance (ESI)', amount: esi });
  if (pt > 0 || bd?.ptStatus === 'APPLIED') deductionRows.push({ label: 'Professional Tax (PT)', amount: pt });

  // In engine-calculated items `other_deductions` stores the LOP amount, which is
  // already excluded from gross; only a remainder that the net actually absorbed
  // is a real deduction.
  const lopAmount = bd ? toNumber(bd.lopAmount) ?? 0 : 0;
  const statutory = deductionRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const otherCandidate = round2((toNumber(payslip.other_deductions) ?? 0) - lopAmount);
  if (otherCandidate > 0 && gross != null && net != null && sameAmount(gross - statutory - otherCandidate, net)) {
    deductionRows.push({ label: 'Other Deductions', amount: otherCandidate });
  }
  const totalDeductions = round2(deductionRows.reduce((s, r) => s + Number(r.amount || 0), 0));

  const employerRows = [];
  const pfEmployer = toNumber(payslip.pf_employer);
  if (pfEmployer != null && (pfEmployer > 0 || byCode.PF_EMPLOYER)) {
    employerRows.push({ label: 'Employer PF Contribution', amount: pfEmployer });
  }
  const esiEmployer = toNumber(payslip.esi_employer) ?? 0;
  if (esiEmployer > 0) employerRows.push({ label: 'Employer ESI Contribution', amount: esiEmployer });
  const gratuity = bd ? toNumber(bd.gratuity) ?? 0 : 0;
  if (gratuity > 0 && byCode.GRATUITY?.enabled !== false) {
    employerRows.push({ label: 'Gratuity (Employer Provision)', amount: gratuity });
  }

  const reconciled = gross != null && net != null && sameAmount(gross - totalDeductions, net);

  const notes = [];
  if (!bd) notes.push('A component-wise breakdown was not stored for this payroll run, so only finalized totals are shown.');
  if (lopAmount > 0) {
    notes.push(
      `Loss of pay for ${formatDays(bd.lopDays) ?? 'the recorded'} day(s) (INR ${formatPayslipAmount(lopAmount)}) is already reflected in the earned amounts and is not deducted again.`
    );
  }
  if (!reconciled) {
    notes.push('Totals are shown exactly as finalized in payroll. Please contact HR if you have questions about this payslip.');
  }

  return {
    header,
    employee,
    attendance: attendanceRows,
    earnings: {
      showRate,
      rows: earningRows,
      rateTotal: showRate ? round2(earningRows.reduce((s, r) => s + Number(r.rate || 0), 0)) : null,
      total: gross
    },
    deductions: { rows: deductionRows, total: totalDeductions },
    employer: employerRows,
    summary: {
      gross,
      totalDeductions,
      net,
      words: net != null ? amountInWords(net) : null,
      currency: 'INR (Indian Rupee)'
    },
    bank: pairsToRows([
      ['Bank Name', textOr(payslip.bank_name)],
      ['Account Holder', textOr(payslip.account_holder_name)],
      ['Account Number', maskedOr(payslip.bank_account_masked)],
      ['IFSC', textOr(payslip.ifsc_code)],
      ['Payment Status', isPaid ? 'Paid' : 'Pending'],
      ['Payment Date', paymentDate || NOT_RECORDED]
    ]),
    notes,
    reconciled
  };
}

const PDF_TEAL = [15, 118, 110];
const PDF_INK = [15, 23, 42];
const PDF_MUTED = [100, 116, 139];
const PDF_LINE = [203, 213, 225];
const PDF_SOFT = [241, 245, 249];

/**
 * Single payslip PDF layout shared by the admin and employee payslip pages.
 * Renders the same sections as the on-screen PayslipCard.
 */
export async function generatePayslipPdf(
  payslipData,
  { companyAddressDefault = COMPANY_ADDRESS_DEFAULT } = {}
) {
  if (!payslipData) return;
  const model = buildPayslipDocument(payslipData, { companyAddressDefault });
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadCompanyLogoDataUrl();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 14;
  const right = pageWidth - 14;
  const contentWidth = right - left;
  const bottomLimit = pageHeight - 18;
  const amount = (n) => formatPayslipAmount(n);
  const tableMargin = { left, right: 14, top: 22, bottom: 18 };

  let y = 12;
  const logoWidth = 34;
  const logoHeight = logoWidth / COMPANY_LOGO_ASPECT;
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', left, y, logoWidth, logoHeight, undefined, 'FAST');
    } catch {
      // logo is decorative
    }
  }
  const textX = logo ? left + logoWidth + 6 : left;
  const textWidth = right - textX;
  doc.setTextColor(...PDF_INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(model.header.companyName, textX, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_MUTED);
  let textY = y + 10;
  const addressLines = doc.splitTextToSize(model.header.address, textWidth);
  doc.text(addressLines, textX, textY);
  textY += addressLines.length * 3.8;
  if (model.header.contacts.length) {
    const contactLines = doc.splitTextToSize(model.header.contacts.join('   |   '), textWidth);
    doc.text(contactLines, textX, textY);
    textY += contactLines.length * 3.8;
  }
  y = Math.max(y + logoHeight, textY) + 3;

  doc.setFillColor(...PDF_TEAL);
  doc.rect(left, y, contentWidth, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(model.header.title.toUpperCase(), left + 3, y + 6.2);
  doc.setFontSize(10);
  doc.text(`Salary for ${model.header.periodLabel}`, right - 3, y + 6.2, { align: 'right' });
  y += 9;

  const metaCells = model.header.meta;
  autoTable(doc, {
    startY: y,
    margin: tableMargin,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5, textColor: PDF_INK, lineColor: PDF_LINE, lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: { fillColor: PDF_SOFT, textColor: PDF_MUTED, fontStyle: 'bold', fontSize: 7.5 },
    head: [metaCells.map(([label]) => label)],
    body: [metaCells.map(([, value]) => value)]
  });
  y = doc.lastAutoTable.finalY + 5;

  function ensureSpace(height) {
    if (y + height > bottomLimit) {
      doc.addPage();
      y = 24;
    }
  }

  function sectionTitle(text) {
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...PDF_TEAL);
    doc.text(text.toUpperCase(), left, y);
    doc.setDrawColor(...PDF_LINE);
    doc.setLineWidth(0.3);
    doc.line(left, y + 1.5, right, y + 1.5);
    y += 3;
  }

  function detailsTable(rows) {
    const labelStyle = { fontStyle: 'bold', textColor: PDF_MUTED, cellWidth: 32 };
    autoTable(doc, {
      startY: y,
      margin: tableMargin,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.5, textColor: PDF_INK, lineColor: PDF_LINE, lineWidth: 0.2, overflow: 'linebreak' },
      columnStyles: { 0: labelStyle, 2: labelStyle },
      body: rows.map(([a, b]) => [a[0], a[1], b ? b[0] : '', b ? b[1] : ''])
    });
    y = doc.lastAutoTable.finalY + 5;
  }

  sectionTitle('Employee Details');
  detailsTable(model.employee);

  sectionTitle('Attendance & Payable Days');
  autoTable(doc, {
    startY: y,
    margin: tableMargin,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.5, halign: 'center', textColor: PDF_INK, lineColor: PDF_LINE, lineWidth: 0.2 },
    headStyles: { fillColor: PDF_SOFT, textColor: PDF_MUTED, fontStyle: 'bold', fontSize: 7.5 },
    head: [model.attendance.map(([label]) => label)],
    body: [model.attendance.map(([, value]) => value)]
  });
  y = doc.lastAutoTable.finalY + 5;

  sectionTitle('Earnings & Deductions');
  const earnings = model.earnings;
  const deductions = model.deductions;
  const rowCount = Math.max(earnings.rows.length, deductions.rows.length, 1);
  const pad = (rows, width) => [...rows, ...Array.from({ length: rowCount - rows.length }, () => Array(width).fill(''))];
  const gap = 4;
  const halfWidth = (contentWidth - gap) / 2;
  const tableStyles = { fontSize: 8.5, cellPadding: 1.5, textColor: PDF_INK, lineColor: PDF_LINE, lineWidth: 0.2, overflow: 'linebreak', minCellHeight: 6 };
  const footStyles = { fillColor: PDF_SOFT, textColor: PDF_INK, fontStyle: 'bold' };
  ensureSpace(20 + rowCount * 6);
  const tablesY = y;
  const tablesPage = doc.getNumberOfPages();

  const earningLabel = (r) => `${r.label}${r.note ? ` (${r.note})` : ''}`;
  autoTable(doc, {
    startY: tablesY,
    margin: { ...tableMargin, right: pageWidth - left - halfWidth },
    tableWidth: halfWidth,
    theme: 'grid',
    styles: tableStyles,
    headStyles: { fillColor: PDF_TEAL, textColor: 255, fontStyle: 'bold' },
    footStyles,
    head: [earnings.showRate ? ['Earnings', 'Monthly Rate', 'Earned'] : ['Earnings', 'Amount']],
    body: pad(
      earnings.rows.map((r) => (earnings.showRate ? [earningLabel(r), amount(r.rate), amount(r.amount)] : [earningLabel(r), amount(r.amount)])),
      earnings.showRate ? 3 : 2
    ),
    foot: [earnings.showRate ? ['Gross Earnings', amount(earnings.rateTotal), amount(earnings.total)] : ['Gross Earnings', amount(earnings.total)]],
    columnStyles: earnings.showRate
      ? { 1: { halign: 'right', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 22 } }
      : { 1: { halign: 'right', cellWidth: 26 } },
    didParseCell: (data) => {
      if (data.section !== 'body' && data.column.index > 0) data.cell.styles.halign = 'right';
    }
  });
  const earningsEnd = doc.lastAutoTable.finalY;

  doc.setPage(tablesPage);
  autoTable(doc, {
    startY: tablesY,
    margin: { ...tableMargin, left: left + halfWidth + gap },
    tableWidth: halfWidth,
    theme: 'grid',
    styles: tableStyles,
    headStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: 'bold' },
    footStyles,
    head: [['Deductions', 'Amount']],
    body: pad(deductions.rows.map((r) => [r.label, amount(r.amount)]), 2),
    foot: [['Total Deductions', amount(deductions.total)]],
    columnStyles: { 1: { halign: 'right', cellWidth: 26 } },
    didParseCell: (data) => {
      if (data.section !== 'body' && data.column.index > 0) data.cell.styles.halign = 'right';
    }
  });
  y = Math.max(earningsEnd, doc.lastAutoTable.finalY) + 4;

  if (model.notes.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...PDF_MUTED);
    for (const note of model.notes) {
      const lines = doc.splitTextToSize(`• ${note}`, contentWidth);
      ensureSpace(lines.length * 3.6 + 1);
      doc.text(lines, left, y + 1);
      y += lines.length * 3.6 + 1;
    }
  }
  y += 4;

  if (model.employer.length) {
    sectionTitle('Employer Contributions (not deducted from salary)');
    autoTable(doc, {
      startY: y,
      margin: tableMargin,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.5, textColor: PDF_INK, lineColor: PDF_LINE, lineWidth: 0.2 },
      body: model.employer.map((r) => [r.label, amount(r.amount)]),
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } }
    });
    y = doc.lastAutoTable.finalY + 5;
  }

  sectionTitle('Salary Summary');
  const summary = model.summary;
  autoTable(doc, {
    startY: y,
    margin: tableMargin,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.2, textColor: PDF_INK, lineColor: PDF_LINE, lineWidth: 0.2 },
    headStyles: { fillColor: PDF_SOFT, textColor: PDF_MUTED, fontStyle: 'bold', halign: 'right' },
    head: [['Gross Earnings', 'Total Deductions', 'Net Salary Payable']],
    body: [[amount(summary.gross), amount(summary.totalDeductions), `INR ${amount(summary.net)}`]],
    columnStyles: { 0: { halign: 'right' }, 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold', fillColor: [204, 251, 241], textColor: [17, 94, 89] } }
  });
  y = doc.lastAutoTable.finalY + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_INK);
  const wordLines = doc.splitTextToSize(
    `Net salary in words: ${summary.words || '—'}   |   Currency: ${summary.currency}`,
    contentWidth
  );
  ensureSpace(wordLines.length * 4 + 4);
  doc.text(wordLines, left, y + 1);
  y += wordLines.length * 4 + 5;

  sectionTitle('Bank & Payment Details');
  detailsTable(model.bank);

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...PDF_INK);
      doc.text(`${model.header.companyName} — Payslip ${model.header.periodLabel}`, left, 14);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...PDF_MUTED);
      doc.text(model.header.meta[1][1], right, 14, { align: 'right' });
      doc.setDrawColor(...PDF_LINE);
      doc.line(left, 16, right, 16);
    }
    doc.setDrawColor(...PDF_LINE);
    doc.line(left, pageHeight - 13, right, pageHeight - 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text('This is a system-generated payslip and does not require a signature.', left, pageHeight - 8.5);
    doc.text(`Page ${page} of ${totalPages}`, right, pageHeight - 8.5, { align: 'right' });
  }

  doc.save(`${payslipData.payslip_number || 'payslip'}.pdf`);
}
