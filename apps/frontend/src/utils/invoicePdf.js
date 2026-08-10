import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const SRSB_INVOICE_PROFILE = Object.freeze({
  legalName: 'SRSB WORKFORCE SOLUTIONS PVT LTD',
  gstNumber: '29ABQCS9374K1Z6',
  registeredAddress: 'No. 228/B, 55th Cross, 3rd Block, Rajajinagar, Bangalore - 560010',
  email: 'srsbhrsolutions25@gmail.com',
  phone: '8317406575 / 8660666087',
  sacCode: '998616',
  stateCode: '29',
  recruitmentDescription: 'This is with Regard to manpower recruitment charges of below mentioned Candidates',
  bankAccountName: 'SRSB WORKFORCE SOLUTIONS PVT LTD',
  bankAccountNumber: '13340200111222',
  bankIfsc: 'FDRL0001334',
  bankName: 'Federal Bank',
  bankBranch: 'Rajajinagar',
  signatoryLabel: 'Authorised Signatory'
});

const money = (value) => Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const date = (value) => value
  ? new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  : 'â€”';

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
  const crore = Math.floor(number / 10000000);
  number %= 10000000;
  const lakh = Math.floor(number / 100000);
  number %= 100000;
  const thousand = Math.floor(number / 1000);
  number %= 1000;

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

function assetUrl(fileName) {
  try {
    return new URL(`./${fileName}`, document.baseURI).href;
  } catch {
    return '';
  }
}

function logoUrl() {
  return assetUrl('company-logo.png');
}

function signatureUrl() {
  return assetUrl('authorised-signature.png');
}

async function loadImageDataUrl(url) {
  if (!url) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width || 1;
        canvas.height = image.naturalHeight || image.height || 1;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function clientAddress(invoice) {
  return [invoice.address_line, invoice.city, invoice.state, invoice.postal_code]
    .filter(Boolean)
    .join(', ');
}

function itemRateText(item) {
  const rate = Number(item.fee_rate ?? item.feeRate ?? 0);
  return `${rate.toLocaleString('en-IN', { maximumFractionDigits: 3 })}% of Billing CTC`;
}

function taxRows(invoice) {
  const rows = [
    {
      particular: 'Value of Service Rendered',
      ref: 'A',
      dutyRate: invoice.items?.length === 1
        ? itemRateText(invoice.items[0])
        : 'As per candidate-wise duty rates',
      value: Number(invoice.subtotal || 0)
    }
  ];

  if (Number(invoice.igst_amount || 0) > 0) {
    rows.push({
      particular: `IGST ${Number(invoice.igst_rate || 0)}%`,
      ref: 'B',
      dutyRate: `${Number(invoice.igst_rate || 0)}%`,
      value: Number(invoice.igst_amount || 0)
    });
  } else {
    if (Number(invoice.cgst_amount || 0) > 0) {
      rows.push({
        particular: `CGST ${Number(invoice.cgst_rate || 0)}%`,
        ref: 'B',
        dutyRate: `${Number(invoice.cgst_rate || 0)}%`,
        value: Number(invoice.cgst_amount || 0)
      });
    }
    if (Number(invoice.sgst_amount || 0) > 0) {
      rows.push({
        particular: `SGST ${Number(invoice.sgst_rate || 0)}%`,
        ref: 'C',
        dutyRate: `${Number(invoice.sgst_rate || 0)}%`,
        value: Number(invoice.sgst_amount || 0)
      });
    }
  }

  return rows;
}

function totalReference(invoice) {
  return Number(invoice.sgst_amount || 0) > 0 ? 'A+B+C' : Number(invoice.igst_amount || 0) > 0 || Number(invoice.cgst_amount || 0) > 0 ? 'A+B' : 'A';
}

function candidateHtml(item, index, count) {
  return `
    <div class="candidate-block">
      ${count > 1 ? `<div class="candidate-count">Candidate ${index + 1}</div>` : ''}
      <div><b>Name of Candidate :</b><span>${escapeHtml(item.candidate_name_snapshot || item.candidateName || 'â€”')}</span></div>
      <div><b>Location &amp; Grade :</b><span>${escapeHtml(item.location_snapshot || item.location || 'â€”')}</span></div>
      <div><b>Date of Joining :</b><span>${escapeHtml(date(item.joining_date || item.joiningDate))}</span></div>
      <div><b>Designation :</b><span>${escapeHtml(item.designation_snapshot || item.designation || 'â€”')}</span></div>
      <div><b>Billing CTC :</b><span>Rs. ${money(item.annual_ctc || item.annualCtc || 0)}/-</span></div>
    </div>`;
}

export function invoiceHtml(invoice) {
  const items = invoice.items || [];
  const rows = taxRows(invoice);
  const logo = logoUrl();
  const signature = signatureUrl();
  const address = clientAddress(invoice);

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(invoice.invoice_number || 'Recruitment Invoice')}</title>
    <style>
      @page{size:A4;margin:8mm}
      *{box-sizing:border-box}
      body{margin:0;background:#fff;color:#111;font-family:"Times New Roman",serif;font-size:11px}
      .invoice-page{width:194mm;min-height:278mm;margin:0 auto;border:1.2px solid #000;background:#fff}
      .company-header{position:relative;display:grid;grid-template-columns:42mm 1fr;min-height:34mm;border-bottom:1px solid #000}
      .company-logo{display:flex;align-items:center;justify-content:center;padding:4mm}
      .company-logo img{max-width:38mm;max-height:24mm;object-fit:contain}
      .company-details{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5mm 3mm 3mm;text-align:center}
      .company-details h1{margin:0 0 2mm;font-size:16px}
      .company-details p{margin:1mm 0;font-weight:600}
      .company-gst{position:absolute;right:2mm;top:1.5mm;font-weight:700}
      .client-invoice{display:grid;grid-template-columns:1fr 54mm;min-height:42mm;border-bottom:1px solid #000}
      .client-box,.invoice-box{padding:4mm}
      .invoice-box{border-left:1px solid #000}
      .client-box .to-line{display:grid;grid-template-columns:12mm 1fr;gap:1mm}
      .client-box p,.invoice-box p{margin:1.5mm 0;line-height:1.35}
      .invoice-box p{display:grid;grid-template-columns:20mm 3mm 1fr}
      .description{padding:4mm 1mm;border-bottom:1px solid #000;font-size:11px}
      .candidate-block{padding:3mm 1mm;border-bottom:1px solid #000}
      .candidate-count{margin-bottom:2mm;font-weight:700;text-decoration:underline}
      .candidate-block>div:not(.candidate-count){display:grid;grid-template-columns:34mm 1fr;margin:1.5mm 0}
      .candidate-block b{font-weight:700}
      .tax-title{text-align:center;padding:2mm;border-bottom:1px solid #000;font-size:15px;font-weight:700}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #000;padding:2mm;vertical-align:middle}
      th{font-size:10px;text-align:center}
      .tax-table th:nth-child(1){width:52%}.tax-table th:nth-child(2){width:9%}.tax-table th:nth-child(3){width:23%}.tax-table th:nth-child(4){width:16%}
      .center{text-align:center}.right{text-align:right}.total-row td{font-weight:700}
      .words{padding:2.5mm;border-top:0;border-bottom:1px solid #000;font-weight:700}
      .footer-grid{display:grid;grid-template-columns:58% 42%;min-height:42mm}
      .bank{padding:3mm;border-right:1px solid #000}
      .bank h3{margin:0 0 2mm;text-decoration:underline;font-size:11px}
      .bank p{display:grid;grid-template-columns:30mm 3mm 1fr;margin:1.5mm 0}
      .signature{display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center}
      .signature h3{width:100%;margin:0;padding:2mm;border-bottom:1px solid #000;font-size:11px}
      .signature img{max-width:58mm;max-height:25mm;object-fit:contain;margin:2mm auto 0}
      .signature-label{width:100%;padding:2mm;border-top:1px solid #000;font-weight:700}
      @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.invoice-page{margin:0}}
    </style>
  </head>
  <body>
    <div class="invoice-page">
      <div class="company-header">
        <div class="company-gst">GST NO: ${SRSB_INVOICE_PROFILE.gstNumber}</div>
        <div class="company-logo">${logo ? `<img src="${escapeHtml(logo)}" alt="SRSB Logo" />` : ''}</div>
        <div class="company-details">
          <h1>${SRSB_INVOICE_PROFILE.legalName}</h1>
          <p>${SRSB_INVOICE_PROFILE.registeredAddress}</p>
          <p>E: ${SRSB_INVOICE_PROFILE.email}, M: ${SRSB_INVOICE_PROFILE.phone}</p>
        </div>
      </div>

      <div class="client-invoice">
        <div class="client-box">
          <div class="to-line"><span>To,</span><div><p><b>${escapeHtml(invoice.company_name || 'â€”')}</b></p><p>${escapeHtml(address || 'â€”')}</p><p><b>GST No:</b> ${escapeHtml(invoice.client_gst_number || 'â€”')}</p></div></div>
        </div>
        <div class="invoice-box">
          <p><b>Invoice No</b><span>:</span><span>${escapeHtml(invoice.invoice_number || 'â€”')}</span></p>
          <p><b>Date</b><span>:</span><span>${escapeHtml(date(invoice.invoice_date))}</span></p>
          <p><b>SAC</b><span>:</span><span>${SRSB_INVOICE_PROFILE.sacCode}</span></p>
          <p><b>State Code</b><span>:</span><span>${SRSB_INVOICE_PROFILE.stateCode}</span></p>
        </div>
      </div>

      <div class="description">${SRSB_INVOICE_PROFILE.recruitmentDescription}</div>
      ${items.length ? items.map((item, index) => candidateHtml(item, index, items.length)).join('') : '<div class="candidate-block">No candidate selected.</div>'}
      <div class="tax-title">TAX INVOICE</div>
      <table class="tax-table">
        <thead><tr><th>Particulars</th><th>Ref</th><th>Duty Rates</th><th>Total Value</th></tr></thead>
        <tbody>
          ${rows.map((row) => `<tr><td>${escapeHtml(row.particular)}</td><td class="center">${row.ref}</td><td class="center">${escapeHtml(row.dutyRate)}</td><td class="right">${money(row.value)}</td></tr>`).join('')}
          <tr class="total-row"><td>Total (${totalReference(invoice)})</td><td></td><td></td><td class="right">${money(invoice.total_amount)}</td></tr>
        </tbody>
      </table>
      <div class="words">Inwords:&nbsp;&nbsp; ${escapeHtml(amountInWords(invoice.total_amount))}</div>
      <div class="footer-grid">
        <div class="bank">
          <h3>Bank Details</h3>
          <p><b>Account Name</b><span>:</span><span>${SRSB_INVOICE_PROFILE.bankAccountName}</span></p>
          <p><b>Account No</b><span>:</span><span>${SRSB_INVOICE_PROFILE.bankAccountNumber}</span></p>
          <p><b>IFSC Code</b><span>:</span><span>${SRSB_INVOICE_PROFILE.bankIfsc}</span></p>
          <p><b>Branch</b><span>:</span><span>${SRSB_INVOICE_PROFILE.bankBranch}</span></p>
          <p><b>Bank Name</b><span>:</span><span>${SRSB_INVOICE_PROFILE.bankName}</span></p>
        </div>
        <div class="signature">
          <h3>For, ${SRSB_INVOICE_PROFILE.legalName}</h3>
          ${signature ? `<img src="${escapeHtml(signature)}" alt="Authorised signature" />` : ''}
          <div class="signature-label">${SRSB_INVOICE_PROFILE.signatoryLabel}</div>
        </div>
      </div>
    </div>
  </body>
  </html>`;
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
    }, 400);
  };
  frame.srcdoc = invoiceHtml(invoice);
  document.body.appendChild(frame);
}

function drawTextPair(doc, label, value, x, y, labelWidth = 34) {
  doc.setFont('times', 'bold');
  doc.text(label, x, y);
  doc.setFont('times', 'normal');
  doc.text(String(value || 'â€”'), x + labelWidth, y);
}

export async function downloadInvoicePdf(invoice) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 10;
  const width = pageWidth - 20;
  const logoData = await loadImageDataUrl(logoUrl());
  const signatureData = await loadImageDataUrl(signatureUrl());
  let y = 10;

  doc.setDrawColor(0);
  doc.setTextColor(0);
  doc.setLineWidth(0.35);

  const headerHeight = 30;
  doc.rect(left, y, width, headerHeight);
  doc.line(left + 48, y, left + 48, y + headerHeight);
  if (logoData) doc.addImage(logoData, 'PNG', left + 4, y + 7, 40, 16);
  doc.setFont('times', 'bold');
  doc.setFontSize(8.5);
  doc.text(`GST NO: ${SRSB_INVOICE_PROFILE.gstNumber}`, left + width - 2, y + 4, { align: 'right' });
  doc.setFontSize(14);
  doc.text(SRSB_INVOICE_PROFILE.legalName, left + 119, y + 13, { align: 'center' });
  doc.setFontSize(8.5);
  doc.text(SRSB_INVOICE_PROFILE.registeredAddress, left + 119, y + 19, { align: 'center', maxWidth: 132 });
  doc.text(`E: ${SRSB_INVOICE_PROFILE.email}, M: ${SRSB_INVOICE_PROFILE.phone}`, left + 119, y + 25, { align: 'center', maxWidth: 132 });
  y += headerHeight;

  const clientHeight = 36;
  doc.rect(left, y, width, clientHeight);
  doc.line(left + 135, y, left + 135, y + clientHeight);
  doc.setFontSize(9);
  doc.setFont('times', 'normal');
  doc.text('To,', left + 1, y + 7);
  doc.setFont('times', 'bold');
  doc.text(invoice.company_name || 'â€”', left + 14, y + 7);
  doc.setFont('times', 'normal');
  doc.text(clientAddress(invoice) || 'â€”', left + 14, y + 14, { maxWidth: 116 });
  doc.setFont('times', 'bold');
  doc.text(`GST No: ${invoice.client_gst_number || 'â€”'}`, left + 14, y + 29);
  drawTextPair(doc, 'Invoice No', invoice.invoice_number, left + 138, y + 8, 21);
  drawTextPair(doc, 'Date', date(invoice.invoice_date), left + 138, y + 15, 21);
  drawTextPair(doc, 'SAC', SRSB_INVOICE_PROFILE.sacCode, left + 138, y + 22, 21);
  drawTextPair(doc, 'State Code', SRSB_INVOICE_PROFILE.stateCode, left + 138, y + 29, 21);
  y += clientHeight;

  doc.rect(left, y, width, 11);
  doc.setFont('times', 'normal');
  doc.text(SRSB_INVOICE_PROFILE.recruitmentDescription, left + 1, y + 7);
  y += 11;

  const items = invoice.items || [];
  for (let index = 0; index < Math.max(items.length, 1); index += 1) {
    const item = items[index] || {};
    const blockHeight = items.length > 1 ? 37 : 32;
    if (y + blockHeight + 70 > pageHeight - 8) {
      doc.addPage();
      y = 10;
      doc.setFont('times', 'bold');
      doc.setFontSize(12);
      doc.text(`${invoice.invoice_number || ''} â€” Candidate Details`, left, y + 5);
      y += 10;
    }
    doc.rect(left, y, width, blockHeight);
    doc.setFontSize(9);
    let line = y + 6;
    if (items.length > 1) {
      doc.setFont('times', 'bold');
      doc.text(`Candidate ${index + 1}`, left + 1, line);
      line += 5;
    }
    drawTextPair(doc, 'Name of Candidate :', item.candidate_name_snapshot || item.candidateName, left + 1, line, 34);
    line += 5;
    drawTextPair(doc, 'Location & Grade :', item.location_snapshot || item.location, left + 1, line, 34);
    line += 5;
    drawTextPair(doc, 'Date of Joining :', date(item.joining_date || item.joiningDate), left + 1, line, 34);
    line += 5;
    drawTextPair(doc, 'Designation :', item.designation_snapshot || item.designation, left + 1, line, 34);
    line += 5;
    drawTextPair(doc, 'Billing CTC :', `Rs. ${money(item.annual_ctc || item.annualCtc || 0)}/-`, left + 1, line, 34);
    y += blockHeight;
  }

  doc.rect(left, y, width, 9);
  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text('TAX INVOICE', pageWidth / 2, y + 6, { align: 'center' });
  y += 9;

  const rows = taxRows(invoice);
  autoTable(doc, {
    startY: y,
    head: [['Particulars', 'Ref', 'Duty Rates', 'Total Value']],
    body: [
      ...rows.map((row) => [row.particular, row.ref, row.dutyRate, money(row.value)]),
      [{ content: `Total (${totalReference(invoice)})`, styles: { fontStyle: 'bold' } }, '', '', { content: money(invoice.total_amount), styles: { fontStyle: 'bold', halign: 'right' } }]
    ],
    theme: 'grid',
    styles: { font: 'times', fontSize: 8.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 99 },
      1: { cellWidth: 17, halign: 'center' },
      2: { cellWidth: 44, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' }
    },
    margin: { left, right: left }
  });

  y = doc.lastAutoTable.finalY;
  doc.rect(left, y, width, 8);
  doc.setFont('times', 'bold');
  doc.setFontSize(8.5);
  doc.text(`Inwords:   ${amountInWords(invoice.total_amount)}`, left + 1, y + 5.5);
  y += 8;

  const footerHeight = 38;
  if (y + footerHeight > pageHeight - 8) {
    doc.addPage();
    y = 10;
  }
  doc.rect(left, y, width, footerHeight);
  doc.line(left + 114, y, left + 114, y + footerHeight);
  doc.setFont('times', 'bold');
  doc.setFontSize(9);
  doc.text('Bank Details', left + 1, y + 5);
  doc.setFont('times', 'normal');
  drawTextPair(doc, 'Account Name', SRSB_INVOICE_PROFILE.bankAccountName, left + 1, y + 11, 28);
  drawTextPair(doc, 'Account No', SRSB_INVOICE_PROFILE.bankAccountNumber, left + 1, y + 17, 28);
  drawTextPair(doc, 'IFSC Code', SRSB_INVOICE_PROFILE.bankIfsc, left + 1, y + 23, 28);
  drawTextPair(doc, 'Branch', SRSB_INVOICE_PROFILE.bankBranch, left + 1, y + 29, 28);
  drawTextPair(doc, 'Bank Name', SRSB_INVOICE_PROFILE.bankName, left + 1, y + 35, 28);
  doc.setFont('times', 'bold');
  doc.text(`For, ${SRSB_INVOICE_PROFILE.legalName}`, left + 152, y + 6, { align: 'center' });
  if (signatureData) doc.addImage(signatureData, 'PNG', left + 120, y + 8, 66, 22);
  doc.line(left + 114, y + 32, left + width, y + 32);
  doc.text(SRSB_INVOICE_PROFILE.signatoryLabel, left + 152, y + 36.5, { align: 'center' });

  const fileName = `${invoice.invoice_number || 'SRSB-Invoice'}-${String(invoice.company_name || 'Client').replace(/[^a-z0-9]+/gi, '-')}.pdf`;
  doc.save(fileName);
}


