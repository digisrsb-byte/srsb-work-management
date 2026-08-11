import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const allowedStatuses = ['DRAFT','PENDING','PARTIALLY_PAID','PAID','SUCCESS','FAILED','CANCELLED'];
const DEFAULT_SAC_CODE = '998591';
const allowedGstTypes = ['NONE','IGST','CGST_SGST'];
const allowedFeeTypes = ['PERCENTAGE_CTC','PERCENTAGE_GROSS','FIXED','CUSTOM'];

function idFrom(value, label = 'invoice ID') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(`Invalid ${label}.`, 400);
  return id;
}

function optionalId(value, label = 'ID') {
  if (value === '' || value === null || value === undefined) return null;
  return idFrom(value, label);
}

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new AppError('Amounts must be valid positive numbers.', 400);
  }
  return Math.round(number * 100) / 100;
}

function rate(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new AppError('GST and recruitment fee percentages must be between 0 and 100.', 400);
  }
  return Math.round(number * 1000) / 1000;
}

function dateValue(value, label) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AppError(`Select a valid ${label}.`, 400);
  return text;
}

function calculateItem(rawItem) {
  const feeType = String(rawItem.feeType || 'FIXED').toUpperCase();
  if (!allowedFeeTypes.includes(feeType)) throw new AppError('Select a valid recruitment fee type.', 400);

  const annualCtc = money(rawItem.annualCtc);
  const grossSalary = money(rawItem.grossSalary);
  const feeRate = rate(rawItem.feeRate);
  let taxableAmount = money(rawItem.taxableAmount);

  if (feeType === 'PERCENTAGE_CTC') taxableAmount = money(annualCtc * feeRate / 100);
  if (feeType === 'PERCENTAGE_GROSS') taxableAmount = money(grossSalary * feeRate / 100);
  if (taxableAmount <= 0) throw new AppError('Every invoice candidate must have a recruitment fee greater than zero.', 400);

  return {
    placementHistoryId: optionalId(rawItem.placementHistoryId, 'placement history'),
    candidateId: optionalId(rawItem.candidateId, 'candidate'),
    candidateName: String(rawItem.candidateName || '').trim(),
    designation: String(rawItem.designation || '').trim() || null,
    location: String(rawItem.location || '').trim() || null,
    joiningDate: rawItem.joiningDate ? dateValue(rawItem.joiningDate, 'joining date') : null,
    annualCtc,
    grossSalary,
    feeType,
    feeRate,
    taxableAmount
  };
}

async function validateItems(connection, clientId, rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw new AppError('Select at least one placed candidate for the recruitment invoice.', 400);
  }
  if (rawItems.length > 50) throw new AppError('A maximum of 50 candidates can be included in one invoice.', 400);

  const items = [];
  for (const rawItem of rawItems) {
    const item = calculateItem(rawItem);
    if (item.placementHistoryId) {
      const [[placement]] = await connection.query(
        `SELECT h.id, h.candidate_id, h.client_id, h.position, h.location, h.joining_date,
           h.offered_ctc, h.ctc, h.gross_salary, h.employment_status, c.full_name AS candidate_name
         FROM candidate_employment_history h
         JOIN candidates c ON c.id = h.candidate_id
         WHERE h.id = ?`,
        [item.placementHistoryId]
      );
      if (!placement) throw new AppError('A selected candidate placement no longer exists.', 404);
      if (Number(placement.client_id) !== Number(clientId)) {
        throw new AppError('Every selected candidate must be placed with the selected client.', 400);
      }
      if (!['JOINED','ACTIVE'].includes(placement.employment_status)) {
        throw new AppError('Only joined or active placements can be invoiced.', 409);
      }
      if (!placement.joining_date) {
        throw new AppError('The selected placement is missing its joining date.', 409);
      }
      item.candidateId = placement.candidate_id;
      item.candidateName = placement.candidate_name;
      item.designation = item.designation || placement.position;
      item.location = item.location || placement.location;
      item.joiningDate = item.joiningDate || (placement.joining_date ? String(placement.joining_date).slice(0, 10) : null);
      if (!item.annualCtc) item.annualCtc = money(placement.offered_ctc || placement.ctc);
      if (!item.grossSalary) item.grossSalary = money(placement.gross_salary);
      // Recalculate percentage-based fee after database values are applied.
      if (item.feeType === 'PERCENTAGE_CTC') item.taxableAmount = money(item.annualCtc * item.feeRate / 100);
      if (item.feeType === 'PERCENTAGE_GROSS') item.taxableAmount = money(item.grossSalary * item.feeRate / 100);
    }
    if (!item.candidateName) throw new AppError('Candidate name is required for every invoice row.', 400);
    if (item.taxableAmount <= 0) throw new AppError('Recruitment fee must be greater than zero.', 400);
    items.push(item);
  }
  return items;
}

function deriveTotals(body, items, paidAmountOverride = null) {
  const subtotal = money(items.reduce((sum, item) => sum + Number(item.taxableAmount || 0), 0));
  const gstType = String(body.gstType || 'NONE').toUpperCase();
  if (!allowedGstTypes.includes(gstType)) throw new AppError('Invalid GST type.', 400);

  let cgstRate = rate(body.cgstRate);
  let sgstRate = rate(body.sgstRate);
  let igstRate = rate(body.igstRate);
  if (gstType === 'NONE') cgstRate = sgstRate = igstRate = 0;
  if (gstType === 'IGST') cgstRate = sgstRate = 0;
  if (gstType === 'CGST_SGST') igstRate = 0;

  const cgst = money(subtotal * cgstRate / 100);
  const sgst = money(subtotal * sgstRate / 100);
  const igst = money(subtotal * igstRate / 100);
  const gstAmount = money(cgst + sgst + igst);
  const totalAmount = money(subtotal + gstAmount);
  const paidAmount = paidAmountOverride === null ? money(body.paidAmount) : money(paidAmountOverride);
  if (paidAmount > totalAmount) throw new AppError('Paid amount cannot exceed the invoice total.', 400);

  let status = String(body.status || 'PENDING').toUpperCase();
  if (!allowedStatuses.includes(status)) status = 'PENDING';
  if (status !== 'CANCELLED' && status !== 'FAILED') {
    if (totalAmount > 0 && paidAmount >= totalAmount) status = 'SUCCESS';
    else if (paidAmount > 0) status = 'PARTIALLY_PAID';
    else if (status !== 'DRAFT' && status !== 'SUCCESS') status = 'PENDING';
  }

  return {
    subtotal,
    serviceCharges: subtotal,
    gstType,
    cgstRate,
    sgstRate,
    igstRate,
    cgst,
    sgst,
    igst,
    gstAmount,
    totalAmount,
    paidAmount,
    status
  };
}

async function insertInvoiceItems(connection, invoiceId, items) {
  for (const item of items) {
    await connection.query(
      `INSERT INTO invoice_items (
         invoice_id, candidate_id, placement_history_id, candidate_name_snapshot,
         designation_snapshot, location_snapshot, joining_date, annual_ctc,
         gross_salary, fee_type, fee_rate, taxable_amount
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, item.candidateId, item.placementHistoryId, item.candidateName,
        item.designation, item.location, item.joiningDate, item.annualCtc,
        item.grossSalary, item.feeType, item.feeRate, item.taxableAmount]
    );
  }
}

async function loadSettings(connection = pool) {
  const [[settings]] = await connection.query('SELECT * FROM invoice_settings WHERE id = 1');
  return settings || null;
}

export const getInvoiceReference = asyncHandler(async (req, res) => {
  const settings = await loadSettings();
  const prefix = settings?.invoice_prefix || 'SRSB';
  const [rows] = await pool.query(
    `SELECT invoice_number FROM invoices
     WHERE invoice_number LIKE ?
     ORDER BY id DESC LIMIT 200`,
    [`${prefix}%`]
  );
  let highest = 0;
  for (const row of rows) {
    const match = String(row.invoice_number || '').match(/(\d+)$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  const nextInvoiceNumber = `${prefix}${String(highest + 1).padStart(3, '0')}`;
  res.json({ success: true, data: { settings, nextInvoiceNumber } });
});

export const getInvoiceSettings = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await loadSettings() });
});

export const updateInvoiceSettings = asyncHandler(async (req, res) => {
  const legalName = String(req.body.legalName || '').trim();
  if (!legalName) throw new AppError('Company legal name is required.', 400);
  const values = {
    legalName,
    gstNumber: String(req.body.gstNumber || '').trim() || null,
    registeredAddress: String(req.body.registeredAddress || '').trim() || null,
    email: String(req.body.email || '').trim() || null,
    phone: String(req.body.phone || '').trim() || null,
    defaultSacCode: String(req.body.defaultSacCode || DEFAULT_SAC_CODE).trim(),
    defaultCgstRate: rate(req.body.defaultCgstRate),
    defaultSgstRate: rate(req.body.defaultSgstRate),
    defaultIgstRate: rate(req.body.defaultIgstRate),
    bankAccountName: String(req.body.bankAccountName || '').trim() || null,
    bankAccountNumber: String(req.body.bankAccountNumber || '').trim() || null,
    bankIfsc: String(req.body.bankIfsc || '').trim() || null,
    bankName: String(req.body.bankName || '').trim() || null,
    bankBranch: String(req.body.bankBranch || '').trim() || null,
    authorisedSignatory: String(req.body.authorisedSignatory || '').trim() || 'Authorised Signatory',
    invoicePrefix: String(req.body.invoicePrefix || 'SRSB').trim().toUpperCase().slice(0, 30)
  };
  await pool.query(
    `UPDATE invoice_settings SET legal_name = ?, gst_number = ?, registered_address = ?,
       email = ?, phone = ?, default_sac_code = ?, default_cgst_rate = ?,
       default_sgst_rate = ?, default_igst_rate = ?, bank_account_name = ?,
       bank_account_number = ?, bank_ifsc = ?, bank_name = ?, bank_branch = ?,
       authorised_signatory = ?, invoice_prefix = ?, updated_by = ? WHERE id = 1`,
    [values.legalName, values.gstNumber, values.registeredAddress, values.email,
      values.phone, values.defaultSacCode, values.defaultCgstRate, values.defaultSgstRate,
      values.defaultIgstRate, values.bankAccountName, values.bankAccountNumber,
      values.bankIfsc, values.bankName, values.bankBranch, values.authorisedSignatory,
      values.invoicePrefix, req.user.id]
  );
  res.json({ success: true, message: 'Invoice company and bank settings updated.', data: await loadSettings() });
});

export const listInvoices = asyncHandler(async (req, res) => {
  const conditions = [];
  const values = [];
  const keyword = String(req.query.search || '').trim().toLowerCase();
  const status = String(req.query.status || '').trim().toUpperCase();
  if (status && status !== 'ALL') {
    if (!allowedStatuses.includes(status)) throw new AppError('Invalid invoice status.', 400);
    conditions.push('i.status = ?');
    values.push(status);
  }
  if (keyword) {
    conditions.push(`LOWER(CONCAT_WS(' ', i.invoice_number, c.company_name, c.gst_number,
      i.status, i.gst_type, i.notes,
      (SELECT GROUP_CONCAT(ii.candidate_name_snapshot SEPARATOR ' ') FROM invoice_items ii WHERE ii.invoice_id = i.id))) LIKE ?`);
    values.push(`%${keyword}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT i.id, i.invoice_number, i.client_id, i.invoice_date, i.status, i.sac_code,
       i.place_of_supply, i.gst_type, i.cgst_rate, i.sgst_rate, i.igst_rate,
       i.subtotal, i.gst_amount, i.total_amount, i.paid_amount, i.notes, i.created_at,
       c.company_name, c.gst_number, c.state, c.state_code,
       creator.full_name AS created_by_name,
       COUNT(ii.id) AS item_count,
       GROUP_CONCAT(ii.candidate_name_snapshot ORDER BY ii.id SEPARATOR ', ') AS candidate_names
     FROM invoices i
     JOIN clients c ON c.id = i.client_id
     LEFT JOIN employees creator ON creator.id = i.closed_by
     LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
     ${where}
     GROUP BY i.id
     ORDER BY i.invoice_date DESC, i.id DESC
     LIMIT 1000`,
    values
  );
  res.json({
    success: true,
    data: rows.map((row) => ({
      ...row,
      item_count: Number(row.item_count || 0),
      pending_amount: Math.max(Number(row.total_amount || 0) - Number(row.paid_amount || 0), 0)
    }))
  });
});

export const getInvoice = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const [[invoice]] = await pool.query(
    `SELECT i.*, c.company_name, c.gst_number AS client_gst_number, c.address_line,
       c.city, c.state, c.state_code, c.postal_code, c.company_email, c.company_phone
     FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = ?`,
    [id]
  );
  if (!invoice) throw new AppError('Invoice not found.', 404);
  const [items] = await pool.query(
    `SELECT id, candidate_id, placement_history_id, candidate_name_snapshot,
       designation_snapshot, location_snapshot, joining_date, annual_ctc,
       gross_salary, fee_type, fee_rate, taxable_amount
     FROM invoice_items WHERE invoice_id = ? ORDER BY id`,
    [id]
  );
  const [payments] = await pool.query(
    `SELECT id, amount, payment_date, payment_method, reference_number, created_at
     FROM invoice_payments WHERE invoice_id = ? ORDER BY payment_date DESC, id DESC`,
    [id]
  );
  delete invoice.gst_file_data;
  res.json({
    success: true,
    data: {
      ...invoice,
      items,
      payments,
      settings: await loadSettings(),
      pending_amount: Math.max(Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0), 0)
    }
  });
});

export const createInvoice = asyncHandler(async (req, res) => {
  const invoiceNumber = String(req.body.invoiceNumber || '').trim();
  if (!invoiceNumber) throw new AppError('Invoice number is required.', 400);
  const clientId = idFrom(req.body.clientId, 'client');
  const invoiceDate = dateValue(req.body.invoiceDate, 'invoice date');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[client]] = await connection.query('SELECT id FROM clients WHERE id = ?', [clientId]);
    if (!client) throw new AppError('Client not found.', 404);
    const [[duplicate]] = await connection.query('SELECT id FROM invoices WHERE invoice_number = ? LIMIT 1', [invoiceNumber]);
    if (duplicate) throw new AppError('Invoice number already exists.', 409);

    const items = await validateItems(connection, clientId, req.body.items);
    const totals = deriveTotals(req.body, items);
    const [result] = await connection.query(
      `INSERT INTO invoices (
         invoice_number, client_id, closed_by, billing_model, service_charges,
         gst_type, igst_amount, cgst_amount, sgst_amount, subtotal, gst_amount,
         total_amount, paid_amount, payment_released, payment_date, invoice_date,
         due_date, status, notes, sac_code, place_of_supply, cgst_rate, sgst_rate, igst_rate
       ) VALUES (?, ?, ?, 'FIXED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, clientId, req.user.id, totals.serviceCharges, totals.gstType,
        totals.igst, totals.cgst, totals.sgst, totals.subtotal, totals.gstAmount,
        totals.totalAmount, totals.paidAmount, totals.paidAmount > 0,
        totals.paidAmount > 0 ? (req.body.paymentDate || invoiceDate) : null,
        invoiceDate, totals.status, String(req.body.notes || '').trim() || null,
        String(req.body.sacCode || DEFAULT_SAC_CODE).trim(),
        String(req.body.placeOfSupply || '').trim() || null,
        totals.cgstRate, totals.sgstRate, totals.igstRate]
    );
    await insertInvoiceItems(connection, result.insertId, items);
    if (totals.paidAmount > 0) {
      await connection.query(
        `INSERT INTO invoice_payments (invoice_id, amount, payment_date, payment_method, reference_number)
         VALUES (?, ?, ?, ?, ?)`,
        [result.insertId, totals.paidAmount, req.body.paymentDate || invoiceDate,
          String(req.body.paymentMethod || '').trim() || 'Bank Transfer',
          String(req.body.referenceNumber || '').trim() || null]
      );
    }
    await connection.commit();
    res.status(201).json({ success: true, message: 'Recruitment invoice created successfully.', data: { id: result.insertId } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const updateInvoice = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const invoiceNumber = String(req.body.invoiceNumber || '').trim();
  if (!invoiceNumber) throw new AppError('Invoice number is required.', 400);
  const clientId = idFrom(req.body.clientId, 'client');
  const invoiceDate = dateValue(req.body.invoiceDate, 'invoice date');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[existing]] = await connection.query(
      'SELECT id, paid_amount, status FROM invoices WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!existing) throw new AppError('Invoice not found.', 404);
    const [[duplicate]] = await connection.query(
      'SELECT id FROM invoices WHERE invoice_number = ? AND id <> ? LIMIT 1',
      [invoiceNumber, id]
    );
    if (duplicate) throw new AppError('Another invoice already uses this invoice number.', 409);
    const [[client]] = await connection.query('SELECT id FROM clients WHERE id = ?', [clientId]);
    if (!client) throw new AppError('Client not found.', 404);

    const items = await validateItems(connection, clientId, req.body.items);
    const totals = deriveTotals(req.body, items, existing.paid_amount);
    if (totals.totalAmount < Number(existing.paid_amount || 0)) {
      throw new AppError('Invoice total cannot be reduced below payments already received.', 409);
    }
    await connection.query(
      `UPDATE invoices SET invoice_number = ?, client_id = ?, invoice_date = ?, service_charges = ?,
       gst_type = ?, igst_amount = ?, cgst_amount = ?, sgst_amount = ?, subtotal = ?,
       gst_amount = ?, total_amount = ?, status = ?, notes = ?, sac_code = ?,
       place_of_supply = ?, cgst_rate = ?, sgst_rate = ?, igst_rate = ?, due_date = NULL,
       gst_file_name = NULL, gst_file_mime = NULL, gst_file_data = NULL
       WHERE id = ?`,
      [invoiceNumber, clientId, invoiceDate, totals.serviceCharges, totals.gstType, totals.igst,
        totals.cgst, totals.sgst, totals.subtotal, totals.gstAmount, totals.totalAmount,
        totals.status, String(req.body.notes || '').trim() || null,
        String(req.body.sacCode || DEFAULT_SAC_CODE).trim(),
        String(req.body.placeOfSupply || '').trim() || null,
        totals.cgstRate, totals.sgstRate, totals.igstRate, id]
    );
    await connection.query('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
    await insertInvoiceItems(connection, id, items);
    await connection.commit();
    res.json({ success: true, message: 'Recruitment invoice updated successfully.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const recordPayment = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const amount = money(req.body.amount);
  if (amount <= 0) throw new AppError('Payment amount must be greater than zero.', 400);
  const paymentDate = dateValue(req.body.paymentDate, 'payment date');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[invoice]] = await connection.query(
      'SELECT total_amount, paid_amount, status FROM invoices WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!invoice) throw new AppError('Invoice not found.', 404);
    if (invoice.status === 'CANCELLED') throw new AppError('Payment cannot be recorded for a cancelled invoice.', 409);
    const pendingAmount = Math.max(Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0), 0);
    if (amount > pendingAmount) {
      throw new AppError(`Payment amount cannot exceed the pending amount of ${pendingAmount.toFixed(2)}.`, 400);
    }
    const newPaid = money(Number(invoice.paid_amount || 0) + amount);
    const status = newPaid >= Number(invoice.total_amount) ? 'SUCCESS' : 'PARTIALLY_PAID';
    await connection.query(
      `INSERT INTO invoice_payments (invoice_id, amount, payment_date, payment_method, reference_number)
       VALUES (?, ?, ?, ?, ?)`,
      [id, amount, paymentDate, String(req.body.paymentMethod || '').trim() || null,
        String(req.body.referenceNumber || '').trim() || null]
    );
    await connection.query(
      `UPDATE invoices SET paid_amount = ?, payment_released = TRUE, payment_date = ?, status = ? WHERE id = ?`,
      [newPaid, paymentDate, status, id]
    );
    await connection.commit();
    res.json({ success: true, message: 'Payment recorded successfully.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

/**
 * Set payment outcome from the list UI: SUCCESS | PENDING | FAILED.
 * SUCCESS marks the invoice fully paid; FAILED / PENDING update status only.
 */
export const setPaymentOutcome = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const outcome = String(req.body.outcome || req.body.status || '')
    .trim()
    .toUpperCase();

  const allowedOutcomes = ['SUCCESS', 'PENDING', 'FAILED'];
  if (!allowedOutcomes.includes(outcome)) {
    throw new AppError(
      'Payment outcome must be SUCCESS, PENDING, or FAILED.',
      400
    );
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[invoice]] = await connection.query(
      'SELECT id, total_amount, paid_amount, status FROM invoices WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!invoice) throw new AppError('Invoice not found.', 404);
    if (invoice.status === 'CANCELLED') {
      throw new AppError('Payment outcome cannot be set for a cancelled invoice.', 409);
    }

    if (outcome === 'SUCCESS') {
      const total = money(invoice.total_amount);
      const alreadyPaid = money(invoice.paid_amount);
      const remaining = money(Math.max(total - alreadyPaid, 0));
      if (remaining > 0) {
        await connection.query(
          `INSERT INTO invoice_payments (invoice_id, amount, payment_date, payment_method, reference_number)
           VALUES (?, ?, CURDATE(), ?, ?)`,
          [id, remaining, 'Marked Success', 'UI_PAYMENT_OUTCOME']
        );
      }
      await connection.query(
        `UPDATE invoices
         SET paid_amount = ?, payment_released = TRUE, payment_date = CURDATE(), status = 'SUCCESS'
         WHERE id = ?`,
        [total, id]
      );
    } else if (outcome === 'PENDING') {
      await connection.query(
        `UPDATE invoices SET status = 'PENDING' WHERE id = ?`,
        [id]
      );
    } else {
      await connection.query(
        `UPDATE invoices SET status = 'FAILED' WHERE id = ?`,
        [id]
      );
    }

    await connection.commit();
    res.json({
      success: true,
      message: `Payment marked as ${outcome.toLowerCase()}.`,
      data: { status: outcome }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const cancelInvoice = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const [[invoice]] = await pool.query('SELECT paid_amount FROM invoices WHERE id = ?', [id]);
  if (!invoice) throw new AppError('Invoice not found.', 404);
  if (Number(invoice.paid_amount || 0) > 0) throw new AppError('An invoice with received payments cannot be cancelled.', 409);
  await pool.query(`UPDATE invoices SET status = 'CANCELLED' WHERE id = ?`, [id]);
  res.json({ success: true, message: 'Invoice cancelled.' });
});

export const deleteInvoice = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const [[invoice]] = await pool.query('SELECT paid_amount FROM invoices WHERE id = ?', [id]);
  if (!invoice) throw new AppError('Invoice not found.', 404);
  await pool.query('DELETE FROM invoices WHERE id = ?', [id]);
  res.json({ success: true, message: 'Invoice deleted successfully.' });
});
