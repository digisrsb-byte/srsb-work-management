import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const money = (value) => Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const date = (value) => value
  ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—';

const ones = ['', 'One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const tens = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];

function belowHundred(number) {
  if (number < 20) return ones[number];
  return `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ''}`;
}

function belowThousand(number) {
  if (number < 100) return belowHundred(number);
  return `${ones[Math.floor(number / 100)]} Hundred${number % 100 ? ` ${belowHundred(number % 100)}` : ''}`;
}

export function amountInWords(value) {
  let number = Math.round(Number(value || 0));
  if (!Number.isFinite(number) || number < 0) return '';
  if (number === 0) return 'Zero Rupees Only';
  const parts = [];
  const crore = Math.floor(number / 10000000); number %= 10000000;
  const lakh = Math.floor(number / 100000); number %= 100000;
  const thousand = Math.floor(number / 1000); number %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (number) parts.push(belowThousand(number));
  return `${parts.join(' ')} Rupees Only`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function multiline(value) {
  return escapeHtml(value).replaceAll('\n', '<br/>');
}

function appLogoUrl() {
  try {
    return new URL('./app-icon.png', window.location.href).href;
  } catch {
    return '';
  }
}

async function loadLogoDataUrl() {
  const url = appLogoUrl();
  if (!url) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = Math.max(image.naturalWidth || 1, image.naturalHeight || 1);
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, size, size);
        const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export function invoiceHtml(invoice) {
  const settings = invoice.settings || {};
  const clientAddress = [invoice.address_line, invoice.city, invoice.state, invoice.postal_code]
    .filter(Boolean)
    .join(', ');
  const rows = (invoice.items || []).map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.candidate_name_snapshot)}</td>
      <td>${escapeHtml(item.designation_snapshot)}</td>
      <td>${escapeHtml(item.location_snapshot)}</td>
      <td>${escapeHtml(date(item.joining_date))}</td>
      <td class="number">Rs. ${money(item.annual_ctc || item.gross_salary)}</td>
      <td class="number">Rs. ${money(item.taxable_amount)}</td>
    </tr>`).join('');
  const logo = appLogoUrl();

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoice_number)}</title><style>
    @page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0;font-size:11px;background:#fff}.invoice{max-width:780px;margin:auto;border:1px solid #1f2937}.header{display:flex;gap:16px;align-items:center;padding:14px;border-bottom:2px solid #0f766e}.logo{width:64px;height:64px;object-fit:contain}.header h1{font-size:19px;margin:0 0 4px}.header p{margin:3px 0}.title{text-align:center;font-size:19px;font-weight:800;padding:9px;border-bottom:1px solid #1f2937}.subtitle{text-align:center;font-size:11px;padding-bottom:8px;border-bottom:1px solid #1f2937}.two{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #1f2937}.box{padding:11px}.box+.box{border-left:1px solid #1f2937}.box p{margin:4px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #64748b;padding:6px;vertical-align:top}th{background:#e6fffb}.number{text-align:right;white-space:nowrap}.summary{margin-left:auto;width:48%;border-left:1px solid #1f2937}.summary td:first-child{font-weight:700}.words,.bank,.footer{padding:9px;border-top:1px solid #1f2937}.bank p{margin:4px 0}.footer{text-align:right;min-height:78px}.muted{color:#64748b}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.invoice{border-color:#000}}
  </style></head><body><div class="invoice">
    <div class="header">${logo ? `<img class="logo" src="${escapeHtml(logo)}"/>` : ''}<div><h1>${escapeHtml(settings.legal_name || 'SRSB WORKFORCE SOLUTIONS PVT LTD')}</h1><p>${multiline(settings.registered_address)}</p><p><b>GSTIN:</b> ${escapeHtml(settings.gst_number || '—')} &nbsp; <b>Email:</b> ${escapeHtml(settings.email || '—')} &nbsp; <b>Phone:</b> ${escapeHtml(settings.phone || '—')}</p></div></div>
    <div class="title">TAX INVOICE</div><div class="subtitle">RECRUITMENT &amp; PLACEMENT SERVICES</div>
    <div class="two"><div class="box"><b>Bill To</b><p><strong>${escapeHtml(invoice.company_name)}</strong></p><p>${escapeHtml(clientAddress || '—')}</p><p>GSTIN: ${escapeHtml(invoice.client_gst_number || '—')}</p><p>State Code: ${escapeHtml(invoice.state_code || '—')}</p></div><div class="box"><p><b>Invoice No:</b> ${escapeHtml(invoice.invoice_number)}</p><p><b>Invoice Date:</b> ${escapeHtml(date(invoice.invoice_date))}</p><p><b>SAC:</b> ${escapeHtml(invoice.sac_code || settings.default_sac_code || '998616')}</p><p><b>Place of Supply:</b> ${escapeHtml(invoice.place_of_supply || invoice.state || '—')}</p></div></div>
    <div class="box">This invoice is raised towards recruitment and placement services for the following joined candidate(s).</div>
    <table><thead><tr><th>#</th><th>Candidate</th><th>Designation</th><th>Location</th><th>Joining Date</th><th>CTC / Gross</th><th>Recruitment Fee</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No candidate rows</td></tr>'}</tbody></table>
    <table class="summary"><tbody><tr><td>Value of Recruitment Services</td><td class="number">Rs. ${money(invoice.subtotal)}</td></tr>${Number(invoice.cgst_amount || 0) ? `<tr><td>CGST ${escapeHtml(invoice.cgst_rate || 0)}%</td><td class="number">Rs. ${money(invoice.cgst_amount)}</td></tr>` : ''}${Number(invoice.sgst_amount || 0) ? `<tr><td>SGST ${escapeHtml(invoice.sgst_rate || 0)}%</td><td class="number">Rs. ${money(invoice.sgst_amount)}</td></tr>` : ''}${Number(invoice.igst_amount || 0) ? `<tr><td>IGST ${escapeHtml(invoice.igst_rate || 0)}%</td><td class="number">Rs. ${money(invoice.igst_amount)}</td></tr>` : ''}<tr><td><b>Grand Total</b></td><td class="number"><b>Rs. ${money(invoice.total_amount)}</b></td></tr></tbody></table>
    <div class="words"><b>Amount in Words:</b> ${escapeHtml(amountInWords(invoice.total_amount))}</div>
    <div class="bank"><b>Bank Details</b><p>Account Name: ${escapeHtml(settings.bank_account_name || '—')} &nbsp; | &nbsp; Account No: ${escapeHtml(settings.bank_account_number || '—')}</p><p>Bank: ${escapeHtml(settings.bank_name || '—')}, ${escapeHtml(settings.bank_branch || '—')} &nbsp; | &nbsp; IFSC: ${escapeHtml(settings.bank_ifsc || '—')}</p>${invoice.notes ? `<p><b>Notes / Replacement Terms:</b> ${multiline(invoice.notes)}</p>` : ''}</div>
    <div class="footer"><b>For ${escapeHtml(settings.legal_name || 'SRSB WORKFORCE SOLUTIONS PVT LTD')}</b><br/><br/><br/>${escapeHtml(settings.authorised_signatory || 'Authorised Signatory')}</div>
  </div></body></html>`;
}

export function printInvoice(invoice) {
  const frame = document.createElement('iframe');
  frame.className = 'invoice-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.onload = () => {
    window.setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        window.setTimeout(() => frame.remove(), 1500);
      }
    }, 300);
  };
  frame.srcdoc = invoiceHtml(invoice);
  document.body.appendChild(frame);
}

export async function downloadInvoicePdf(invoice) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const settings = invoice.settings || {};
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const logoData = await loadLogoDataUrl();
  if (logoData) doc.addImage(logoData, 'PNG', 14, 7, 21, 21);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(settings.legal_name || 'SRSB WORKFORCE SOLUTIONS PVT LTD', pageWidth / 2, 12, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.text(settings.registered_address || '', pageWidth / 2, 17, { align: 'center', maxWidth: 150 });
  doc.text(`GSTIN: ${settings.gst_number || '—'} | ${settings.email || ''} | ${settings.phone || ''}`, pageWidth / 2, 24, { align: 'center', maxWidth: 155 });
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.6);
  doc.line(14, 29, pageWidth - 14, 29);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TAX INVOICE', pageWidth / 2, 36, { align: 'center' });
  doc.setFontSize(8.5);
  doc.text('RECRUITMENT & PLACEMENT SERVICES', pageWidth / 2, 41, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  const address = [invoice.address_line, invoice.city, invoice.state, invoice.postal_code].filter(Boolean).join(', ');
  doc.text(`Bill To: ${invoice.company_name || ''}`, 14, 49);
  doc.text(address || '—', 14, 54, { maxWidth: 105 });
  doc.text(`Client GSTIN: ${invoice.client_gst_number || '—'} | State Code: ${invoice.state_code || '—'}`, 14, 62);
  doc.text(`Invoice No: ${invoice.invoice_number}`, 135, 49);
  doc.text(`Invoice Date: ${date(invoice.invoice_date)}`, 135, 54);
  doc.text(`SAC: ${invoice.sac_code || settings.default_sac_code || '998616'}`, 135, 59);
  doc.text(`Place of Supply: ${invoice.place_of_supply || invoice.state || '—'}`, 135, 64);
  doc.text('Recruitment and placement services for the following joined candidate(s):', 14, 71);

  autoTable(doc, {
    startY: 75,
    head: [['#','Candidate','Designation','Location','Joining','CTC/Gross','Recruitment Fee']],
    body: (invoice.items || []).map((item, index) => [
      index + 1,
      item.candidate_name_snapshot || '',
      item.designation_snapshot || '',
      item.location_snapshot || '',
      date(item.joining_date),
      money(item.annual_ctc || item.gross_salary),
      money(item.taxable_amount)
    ]),
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [15,118,110] },
    columnStyles: { 0: { cellWidth: 8 }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: { left: 14, right: 14 }
  });

  let y = doc.lastAutoTable.finalY + 7;
  const summary = [['Value of Recruitment Services', money(invoice.subtotal)]];
  if (Number(invoice.cgst_amount || 0)) summary.push([`CGST ${invoice.cgst_rate || 0}%`, money(invoice.cgst_amount)]);
  if (Number(invoice.sgst_amount || 0)) summary.push([`SGST ${invoice.sgst_rate || 0}%`, money(invoice.sgst_amount)]);
  if (Number(invoice.igst_amount || 0)) summary.push([`IGST ${invoice.igst_rate || 0}%`, money(invoice.igst_amount)]);
  summary.push(['Grand Total', money(invoice.total_amount)]);
  autoTable(doc, {
    startY: y,
    margin: { left: 103, right: 14 },
    body: summary,
    styles: { fontSize: 8.5 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
  });
  y = doc.lastAutoTable.finalY + 7;
  if (y > pageHeight - 55) {
    doc.addPage();
    y = 18;
  }
  doc.setFontSize(8.5);
  doc.setFont('helvetica','bold');
  doc.text('Amount in Words:', 14, y);
  doc.setFont('helvetica','normal');
  doc.text(amountInWords(invoice.total_amount), 45, y, { maxWidth: 150 });
  y += 9;
  doc.setFont('helvetica','bold');
  doc.text('Bank Details', 14, y);
  doc.setFont('helvetica','normal');
  doc.text(`Account Name: ${settings.bank_account_name || '—'}`, 14, y + 5);
  doc.text(`Account No: ${settings.bank_account_number || '—'} | IFSC: ${settings.bank_ifsc || '—'}`, 14, y + 10);
  doc.text(`Bank: ${settings.bank_name || '—'}, ${settings.bank_branch || '—'}`, 14, y + 15);
  if (invoice.notes) doc.text(`Notes / Replacement Terms: ${invoice.notes}`, 14, y + 21, { maxWidth: 120 });
  doc.setFont('helvetica','bold');
  doc.text(`For ${settings.legal_name || 'SRSB WORKFORCE SOLUTIONS PVT LTD'}`, 196, y + 7, { align: 'right' });
  doc.text(settings.authorised_signatory || 'Authorised Signatory', 196, y + 28, { align: 'right' });
  const fileName = `${invoice.invoice_number}-${String(invoice.company_name || 'Client').replace(/[^a-z0-9]+/gi, '-')}.pdf`;
  doc.save(fileName);
}
