import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  COMPANY_DETAILS,
  COMPANY_LOGO_ASPECT,
  REPORT_CONFIDENTIALITY_LABEL
} from '../config/branding.js';
import { loadCompanyLogoDataUrl } from './payslip.js';
import { buildXlsxBlob, columnLetter, toExcelSerial } from './xlsxWriter.js';

/*
 * A report definition drives the on-screen tables and every export format, so the files always
 * match what the user is looking at:
 *
 * {
 *   title, fileBase, periodLabel, generatedAt,
 *   filters: [{ label, value }],
 *   summary: [{ label, value, type }],
 *   sections: [{
 *     id, title, rows, emptyText, note,
 *     columns: [{ key, header, type, decimals, value(row), pdf, screen, data, dataHeader, link }],
 *     totals: { label, values: { [columnKey]: value } },
 *     csv, xlsx, pdf            // set to false to leave a section out of that format
 *   }]
 * }
 *
 * Column types: text, number, currency, date, datetime, time, status, minutes, list.
 */

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_SHORT = MONTH_NAMES.map((name) => name.slice(0, 3));
const EMPTY = '—';
const NUMERIC_TYPES = new Set(['number', 'currency', 'minutes']);

const NAVY = [15, 23, 42];
const SLATE = [100, 116, 139];
const TEAL = [15, 118, 110];
const BORDER = [226, 232, 240];
const SOFT = [248, 250, 252];

const pad = (n) => String(n).padStart(2, '0');

export function parseDateValue(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value) {
  const date = parseDateValue(value);
  if (!date) return EMPTY;
  return `${pad(date.getDate())} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatTime(value) {
  const date = parseDateValue(value);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : EMPTY;
}

export function formatDateTime(value) {
  const date = parseDateValue(value);
  return date ? `${formatDate(date)}, ${formatTime(date)}` : EMPTY;
}

export function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return 'All dates';
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

export function formatNumber(value, decimals = 0) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return EMPTY;
  return Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function formatAmount(value) {
  return formatNumber(value, 2);
}

export function formatCurrency(value) {
  const amount = formatAmount(value);
  return amount === EMPTY ? EMPTY : `₹${amount}`;
}

export function formatMinutes(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return EMPTY;
  const minutes = Math.round(Number(value));
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

const ACRONYMS = new Set(['HR', 'PF', 'EPF', 'ESI', 'PT', 'CTC', 'LOP', 'ID']);

export function humanizeCode(value) {
  if (value == null || value === '') return EMPTY;
  return String(value)
    .split('_')
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      return word ? upper[0] + word.slice(1).toLowerCase() : word;
    })
    .join(' ');
}

export function isNumericColumn(column) {
  return NUMERIC_TYPES.has(column.type);
}

export function cellValue(column, row) {
  return column.value ? column.value(row) : row?.[column.key];
}

function isBlank(value) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

/** Text for the screen ("ui") or PDF. Lists come back as arrays for the screen. */
export function formatValue(column, value, target = 'ui') {
  if (isBlank(value)) return target === 'ui' && column.type === 'list' ? [] : EMPTY;
  switch (column.type) {
    case 'number':
      return formatNumber(value, column.decimals || 0);
    case 'currency':
      return target === 'ui' ? formatCurrency(value) : formatAmount(value);
    case 'date':
      return formatDate(value);
    case 'datetime':
      return formatDateTime(value);
    case 'time':
      return formatTime(value);
    case 'status':
      return humanizeCode(value);
    case 'minutes':
      return formatMinutes(value);
    case 'list': {
      const items = Array.isArray(value) ? value.map(String) : [String(value)];
      return target === 'ui' ? items : items.join('\n');
    }
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

export function displayValue(column, row, target = 'ui') {
  return formatValue(column, cellValue(column, row), target);
}

function toNumberOrNull(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return null;
  return Number(value);
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Raw value for spreadsheets ("xlsx") and CSV. */
function dataValue(column, value, target) {
  if (isBlank(value)) return null;
  switch (column.type) {
    case 'number':
    case 'currency':
    case 'minutes':
      return toNumberOrNull(value);
    case 'date': {
      const date = parseDateValue(value);
      if (!date) return String(value);
      return target === 'xlsx' ? Math.floor(toExcelSerial(date)) : isoDate(date);
    }
    case 'datetime':
    case 'time': {
      const date = parseDateValue(value);
      if (!date) return String(value);
      return target === 'xlsx'
        ? toExcelSerial(date)
        : `${isoDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    case 'status':
      return target === 'xlsx' ? humanizeCode(value) : String(value);
    case 'list':
      return (Array.isArray(value) ? value : [value]).map(String).join('; ');
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

export const pdfColumns = (section) => section.columns.filter((c) => c.pdf !== false);
export const screenColumns = (section) =>
  section.columns.filter((c) => (c.screen ?? c.pdf) !== false);
export const dataColumns = (section) => section.columns.filter((c) => c.data !== false);
const dataHeader = (column) => column.dataHeader || column.header;

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilePart(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ------------------------------------------------------------------ CSV */

function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  let text = String(value);
  if (/^[=+@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportReportCsv(report) {
  const sections = report.sections.filter((s) => s.csv !== false);
  const lines = [];
  sections.forEach((section, index) => {
    const columns = dataColumns(section);
    if (sections.length > 1) {
      if (index > 0) lines.push('');
      lines.push(csvCell(section.title));
    }
    lines.push(columns.map((c) => csvCell(dataHeader(c))).join(','));
    section.rows.forEach((row) => {
      lines.push(columns.map((c) => csvCell(dataValue(c, cellValue(c, row), 'csv'))).join(','));
    });
  });
  const filename = `${report.fileBase}.csv`;
  downloadBlob(new Blob([`\uFEFF${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }), filename);
  return filename;
}

/* ----------------------------------------------------------------- XLSX */

function xlsxStyle(column, total = false) {
  if (column.type === 'currency' || (column.type === 'number' && column.decimals >= 2)) {
    return total ? 'totalDecimal' : 'decimal';
  }
  if (column.type === 'number' && column.decimals === 1) return total ? 'totalDecimal1' : 'decimal1';
  if (NUMERIC_TYPES.has(column.type)) return total ? 'totalInteger' : 'integer';
  if (total) return 'totalLabel';
  if (column.type === 'date') return 'date';
  if (column.type === 'datetime' || column.type === 'time') return 'datetime';
  return 'text';
}

function columnWidth(column, rows) {
  const typeWidth = { date: 13, datetime: 18, time: 18 }[column.type] || 0;
  let longest = Math.max(dataHeader(column).length, typeWidth);
  for (const row of rows.slice(0, 500)) {
    const text = column.type === 'list'
      ? dataValue(column, cellValue(column, row), 'csv') || ''
      : displayValue(column, row, 'pdf');
    longest = Math.max(longest, String(text).length);
  }
  return Math.min(Math.max(longest + 2, 10), column.type === 'list' ? 70 : 48);
}

function filterSummaryText(report) {
  return report.filters.map((f) => `${f.label}: ${f.value}`).join('; ');
}

export function exportReportXlsx(report) {
  const generatedOn = formatDateTime(new Date());
  const summaryRows = [
    [{ v: COMPANY_DETAILS.legalName, s: 'title' }],
    [{ v: COMPANY_DETAILS.addressLines.join(' '), s: 'muted' }],
    [{ v: `Phone: ${COMPANY_DETAILS.phone} | Email: ${COMPANY_DETAILS.email} | Website: ${COMPANY_DETAILS.website}`, s: 'muted' }],
    [],
    [{ v: 'Report', s: 'label' }, { v: report.title, s: 'subtitle' }],
    [{ v: 'Reporting period', s: 'label' }, { v: report.periodLabel }],
    [{ v: 'Data as of', s: 'label' }, { v: formatDateTime(report.generatedAt) }],
    [{ v: 'Generated on', s: 'label' }, { v: generatedOn }],
    [{ v: 'Classification', s: 'label' }, { v: REPORT_CONFIDENTIALITY_LABEL }],
    [],
    [{ v: 'Applied filters', s: 'section' }],
    ...report.filters.map((f) => [{ v: f.label, s: 'label' }, { v: f.value }])
  ];

  if (report.summary?.length) {
    summaryRows.push(
      [],
      [{ v: 'Summary', s: 'section' }],
      [{ v: 'Measure', s: 'header' }, { v: 'Value', s: 'headerRight' }],
      ...report.summary.map((item) => {
        const column = { type: item.type || 'number', decimals: item.decimals };
        return [
          { v: item.label, s: 'text' },
          { v: dataValue(column, item.value, 'xlsx'), s: xlsxStyle(column) }
        ];
      })
    );
  }

  const sheets = [{ name: 'Summary', rows: summaryRows, widths: [30, 70] }];

  report.sections
    .filter((s) => s.xlsx !== false)
    .forEach((section) => {
      const columns = dataColumns(section);
      const lastCol = columnLetter(Math.max(columns.length - 1, 0));
      const headerRow = 5;
      const rows = [
        [{ v: `${report.title} — ${section.title}`, s: 'title' }],
        [{ v: `${COMPANY_DETAILS.legalName} · Reporting period: ${report.periodLabel}`, s: 'muted' }],
        [{ v: `Filters: ${filterSummaryText(report)}`, s: 'muted' }],
        [],
        columns.map((c) => ({ v: dataHeader(c), s: isNumericColumn(c) ? 'headerRight' : 'header' }))
      ];
      section.rows.forEach((row) => {
        rows.push(columns.map((c) => ({ v: dataValue(c, cellValue(c, row), 'xlsx'), s: xlsxStyle(c) })));
      });
      if (!section.rows.length) {
        rows.push([{ v: section.emptyText || 'No records for the selected filters.', s: 'muted' }]);
      } else if (section.totals) {
        rows.push(
          columns.map((c, i) => {
            if (i === 0) return { v: section.totals.label || 'Total', s: 'totalLabel' };
            const value = section.totals.values?.[c.key];
            return value === undefined
              ? { v: null, s: 'totalLabel' }
              : { v: dataValue(c, value, 'xlsx'), s: xlsxStyle(c, true) };
          })
        );
      }
      sheets.push({
        name: section.sheetName || section.title,
        rows,
        widths: columns.map((c) => columnWidth(c, section.rows)),
        freezeRows: headerRow,
        autoFilter: section.rows.length ? `A${headerRow}:${lastCol}${headerRow + section.rows.length}` : undefined
      });
    });

  const filename = `${report.fileBase}.xlsx`;
  downloadBlob(buildXlsxBlob(sheets, { title: report.title }), filename);
  return filename;
}

/* ------------------------------------------------------------------ PDF */

export async function exportReportPdf(report) {
  const sections = report.sections.filter((s) => s.pdf !== false);
  const widest = Math.max(0, ...sections.map((s) => pdfColumns(s).length));
  const orientation = report.orientation || (widest > 6 ? 'landscape' : 'portrait');
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const generatedOn = formatDateTime(new Date());
  const logo = await loadCompanyLogoDataUrl();

  // Company header
  let textX = margin;
  if (logo) {
    const logoWidth = 34;
    try {
      doc.addImage(logo, 'PNG', margin, 10, logoWidth, logoWidth / COMPANY_LOGO_ASPECT);
      textX = margin + logoWidth + 5;
    } catch {
      textX = margin;
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(COMPANY_DETAILS.legalName, textX, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...SLATE);
  [
    ...COMPANY_DETAILS.addressLines,
    `Phone: ${COMPANY_DETAILS.phone}   |   Email: ${COMPANY_DETAILS.email}`,
    `Website: ${COMPANY_DETAILS.website}`
  ].forEach((line, i) => doc.text(line, textX, 18.2 + i * 3.4));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEAL);
  doc.text(REPORT_CONFIDENTIALITY_LABEL, pageWidth - margin, 14, { align: 'right' });

  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.6);
  doc.line(margin, 32.5, pageWidth - margin, 32.5);

  // Report title and period
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text(report.title, margin, 41);
  const titleWidth = doc.getTextWidth(report.title);

  const periodText = `Reporting period: ${report.periodLabel}`;
  const freshnessText = `Data as of ${formatDateTime(report.generatedAt)}`;
  doc.setFontSize(9.5);
  const periodWidth = doc.getTextWidth(periodText);
  let y;
  if (margin + titleWidth + 8 + periodWidth <= pageWidth - margin) {
    doc.setTextColor(...TEAL);
    doc.text(periodText, pageWidth - margin, 39.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(freshnessText, pageWidth - margin, 44, { align: 'right' });
    y = 48;
  } else {
    doc.setTextColor(...TEAL);
    doc.text(periodText, margin, 47);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(freshnessText, margin, 51.5);
    y = 55;
  }

  // Filter summary
  if (report.filters?.length) {
    doc.setFontSize(8);
    const filterText = report.filters.map((f) => `${f.label}: ${f.value}`).join('     •     ');
    const lines = doc.splitTextToSize(filterText, contentWidth - 22);
    const boxHeight = 3.6 + lines.length * 3.6 + 1.6;
    doc.setFillColor(...SOFT);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text('Filters', margin + 3, y + 4.9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    lines.forEach((line, i) => doc.text(line, margin + 19, y + 4.9 + i * 3.6));
    y += boxHeight + 5;
  }

  // Summary figures
  if (report.summary?.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text('Summary', margin, y + 3);
    y += 6;
    const count = report.summary.length;
    const maxPerRow = orientation === 'landscape' ? 6 : 5;
    const rowsNeeded = Math.ceil(count / maxPerRow);
    const perRow = Math.ceil(count / rowsNeeded);
    const gap = 3;
    const boxWidth = (contentWidth - gap * (perRow - 1)) / perRow;
    const boxHeight = 16;
    report.summary.forEach((item, i) => {
      const x = margin + (i % perRow) * (boxWidth + gap);
      const top = y + Math.floor(i / perRow) * (boxHeight + gap);
      doc.setFillColor(...SOFT);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, top, boxWidth, boxHeight, 1.5, 1.5, 'FD');
      doc.setFillColor(...TEAL);
      doc.rect(x, top + 2, 0.8, boxHeight - 4, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...SLATE);
      doc.text(doc.splitTextToSize(item.label, boxWidth - 6).slice(0, 2), x + 3.5, top + 4.6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(...NAVY);
      const column = { type: item.type || 'number', decimals: item.decimals };
      doc.text(String(formatValue(column, item.value, 'pdf')), x + 3.5, top + 13.2);
    });
    y += rowsNeeded * (boxHeight + gap) + 3;
  }

  // Tables
  sections.forEach((section) => {
    const columns = pdfColumns(section);
    if (y > pageHeight - 45) {
      doc.addPage();
      y = 22;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...NAVY);
    doc.text(section.title, margin, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    const countLabel = section.countLabel ?? `${section.rows.length} ${section.rows.length === 1 ? 'record' : 'records'}`;
    if (countLabel) doc.text(countLabel, pageWidth - margin, y + 3, { align: 'right' });
    y += 5.5;

    const body = section.rows.length
      ? section.rows.map((row) => columns.map((c) => displayValue(c, row, 'pdf')))
      : [[{
          content: section.emptyText || 'No records for the selected filters.',
          colSpan: Math.max(columns.length, 1),
          styles: { halign: 'center', textColor: SLATE, fontStyle: 'italic' }
        }]];
    const foot = section.totals && section.rows.length
      ? [columns.map((c, i) => {
          if (i === 0) return section.totals.label || 'Total';
          const value = section.totals.values?.[c.key];
          return {
            content: value === undefined ? '' : formatValue(c, value, 'pdf'),
            styles: { halign: isNumericColumn(c) ? 'right' : 'left' }
          };
        })]
      : undefined;

    autoTable(doc, {
      startY: y,
      head: [columns.map((c) => ({
        content: c.pdfHeader || c.header,
        styles: { halign: isNumericColumn(c) ? 'right' : 'left' }
      }))],
      body,
      foot,
      theme: 'grid',
      showHead: 'everyPage',
      showFoot: 'lastPage',
      styles: {
        font: 'helvetica',
        fontSize: 7.8,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
        textColor: [30, 41, 59],
        lineColor: BORDER,
        lineWidth: 0.15,
        overflow: 'linebreak',
        valign: 'top'
      },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold', lineColor: TEAL, valign: 'middle' },
      footStyles: { fillColor: [241, 245, 249], textColor: NAVY, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: SOFT },
      columnStyles: Object.fromEntries(
        columns.map((c, i) => [
          i,
          {
            halign: isNumericColumn(c) ? 'right' : 'left',
            ...(c.pdfWidth ? { cellWidth: c.pdfWidth } : {})
          }
        ])
      ),
      margin: { left: margin, right: margin, top: 20, bottom: 16 }
    });
    y = doc.lastAutoTable.finalY + 4;

    if (section.note) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.3);
      doc.setTextColor(...SLATE);
      const lines = doc.splitTextToSize(section.note, contentWidth);
      if (y + lines.length * 3.2 > pageHeight - 16) {
        doc.addPage();
        y = 22;
      }
      doc.text(lines, margin, y + 1.5);
      y += lines.length * 3.2 + 1;
    }
    y += 5;
  });

  // Running header and footer
  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text(COMPANY_DETAILS.legalName, margin, 11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...SLATE);
      doc.text(`${report.title}  ·  ${report.periodLabel}`, pageWidth - margin, 11, { align: 'right' });
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.3);
      doc.line(margin, 13.5, pageWidth - margin, 13.5);
    }
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
    doc.setFontSize(7.3);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(REPORT_CONFIDENTIALITY_LABEL, margin, pageHeight - 6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE);
    doc.text(`Generated on ${generatedOn}`, pageWidth / 2, pageHeight - 6.5, { align: 'center' });
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 6.5, { align: 'right' });
  }

  const filename = `${report.fileBase}.pdf`;
  doc.save(filename);
  return filename;
}
