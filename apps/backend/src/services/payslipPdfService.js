import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPANY_ADDRESS_DEFAULT } from './salaryCalculationService.js';
import { payslipFileName, renderPayslipPdf } from '../../../frontend/src/services/payslip.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(here, '../../../frontend/public/srsb-logo.png');

let logoPromise = null;

function loadLogoDataUrl() {
  if (!logoPromise) {
    logoPromise = fs
      .readFile(LOGO_PATH)
      .then((buf) => `data:image/png;base64,${buf.toString('base64')}`)
      .catch(() => null);
  }
  return logoPromise;
}

/** Renders the same payslip PDF employees download, as a Buffer for email attachments. */
export async function buildPayslipPdfBuffer(payslip) {
  const logo = await loadLogoDataUrl();
  let doc;
  try {
    doc = renderPayslipPdf(payslip, { logo, companyAddressDefault: COMPANY_ADDRESS_DEFAULT });
  } catch (error) {
    if (!logo) throw error;
    doc = renderPayslipPdf(payslip, { logo: null, companyAddressDefault: COMPANY_ADDRESS_DEFAULT });
  }
  return {
    filename: payslipFileName(payslip),
    content: Buffer.from(doc.output('arraybuffer'))
  };
}
