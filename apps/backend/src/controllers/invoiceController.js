import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const allowedStatuses = ['DRAFT','PENDING','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED'];
const allowedGstTypes = ['NONE','IGST','CGST_SGST'];

function idFrom(value, label = 'invoice ID') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(`Invalid ${label}.`, 400);
  return id;
}

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) throw new AppError('Amounts must be valid positive numbers.', 400);
  return Math.round(number * 100) / 100;
}

function parseFile(file) {
  if (!file || !file.data) return { name: null, mime: null, data: null };
  const name = String(file.name || 'gst-document').slice(0, 255);
  const mime = String(file.type || 'application/octet-stream').slice(0, 120);
  const raw = String(file.data);
  const base64 = raw.includes(',') ? raw.split(',').pop() : raw;
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new AppError('GST file could not be read.', 400);
  if (buffer.length > 5 * 1024 * 1024) throw new AppError('GST file must be 5 MB or smaller.', 400);
  return { name, mime, data: buffer };
}

function deriveTotals(body) {
  const serviceCharges = money(body.serviceCharges);
  const gstType = body.gstType || 'NONE';
  if (!allowedGstTypes.includes(gstType)) throw new AppError('Invalid GST type.', 400);

  let igst = money(body.igstAmount);
  let cgst = money(body.cgstAmount);
  let sgst = money(body.sgstAmount);

  if (gstType === 'NONE') igst = cgst = sgst = 0;
  if (gstType === 'IGST') {
    cgst = 0;
    sgst = 0;
  }
  if (gstType === 'CGST_SGST') igst = 0;

  const gstAmount = money(igst + cgst + sgst);
  const totalAmount = money(serviceCharges + gstAmount);
  const paidAmount = money(body.paidAmount);
  if (paidAmount > totalAmount) {
    throw new AppError('Paid amount cannot be greater than the invoice total.', 400);
  }
  const paymentReleased = paidAmount > 0;

  let status = body.status || 'PENDING';
  if (paidAmount >= totalAmount && totalAmount > 0) status = 'PAID';
  else if (paidAmount > 0) status = 'PARTIALLY_PAID';
  else if (!allowedStatuses.includes(status)) status = 'PENDING';

  return { serviceCharges, gstType, igst, cgst, sgst, gstAmount, totalAmount, paidAmount, paymentReleased, status };
}

export const listInvoices = asyncHandler(async (req, res) => {
  const conditions = [];
  const values = [];
  const keyword = String(req.query.search || '').trim().toLowerCase();
  const status = String(req.query.status || '').trim();

  if (status && status !== 'ALL') {
    if (!allowedStatuses.includes(status)) throw new AppError('Invalid invoice status.', 400);
    conditions.push('i.status = ?');
    values.push(status);
  }
  if (keyword) {
    conditions.push(`LOWER(CONCAT_WS(' ', i.invoice_number, c.company_name, c.gst_number,
      i.status, i.gst_type, i.notes)) LIKE ?`);
    values.push(`%${keyword}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT i.id, i.invoice_number, i.client_id, i.opening_id, i.candidate_id,
       i.billing_model, i.service_charges, i.gst_type, i.igst_amount, i.cgst_amount,
       i.sgst_amount, i.subtotal, i.gst_amount, i.total_amount, i.paid_amount,
       i.payment_released, i.payment_date, i.invoice_date, i.due_date, i.status,
       i.gst_file_name, i.notes, i.created_at, c.company_name, c.gst_number,
       jo.title AS opening_title, candidate.full_name AS candidate_name,
       creator.full_name AS created_by_name,
       COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id = i.id), 0) AS payment_history_total
     FROM invoices i
     JOIN clients c ON c.id = i.client_id
     LEFT JOIN job_openings jo ON jo.id = i.opening_id
     LEFT JOIN candidates candidate ON candidate.id = i.candidate_id
     LEFT JOIN employees creator ON creator.id = i.closed_by
     ${where}
     ORDER BY i.invoice_date DESC, i.id DESC
     LIMIT 1000`,
    values
  );

  res.json({
    success: true,
    data: rows.map((row) => ({
      ...row,
      pending_amount: Math.max(Number(row.total_amount || 0) - Number(row.paid_amount || 0), 0),
      has_gst_file: Boolean(row.gst_file_name)
    }))
  });
});

export const getInvoice = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const [[invoice]] = await pool.query(
    `SELECT i.*, c.company_name, c.gst_number, c.address_line, c.city, c.state,
       c.postal_code, c.company_email, c.company_phone
     FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = ?`,
    [id]
  );
  if (!invoice) throw new AppError('Invoice not found.', 404);
  const [payments] = await pool.query(
    `SELECT id, amount, payment_date, payment_method, reference_number, created_at
     FROM invoice_payments WHERE invoice_id = ? ORDER BY payment_date DESC, id DESC`,
    [id]
  );
  delete invoice.gst_file_data;
  res.json({ success: true, data: { ...invoice, payments, has_gst_file: Boolean(invoice.gst_file_name) } });
});

export const createInvoice = asyncHandler(async (req, res) => {
  const invoiceNumber = String(req.body.invoiceNumber || '').trim();
  if (!invoiceNumber) throw new AppError('Invoice number is required.', 400);
  const clientId = idFrom(req.body.clientId, 'client ID');
  const invoiceDate = req.body.invoiceDate;
  if (!invoiceDate) throw new AppError('Invoice date is required.', 400);

  const [[client]] = await pool.query('SELECT id FROM clients WHERE id = ?', [clientId]);
  if (!client) throw new AppError('Client not found.', 404);
  const [[duplicate]] = await pool.query('SELECT id FROM invoices WHERE invoice_number = ? LIMIT 1', [invoiceNumber]);
  if (duplicate) throw new AppError('Invoice number already exists.', 409);

  const totals = deriveTotals(req.body);
  const file = parseFile(req.body.gstFile);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO invoices (
         invoice_number, client_id, opening_id, candidate_id, closed_by, billing_model,
         service_charges, gst_type, igst_amount, cgst_amount, sgst_amount,
         subtotal, gst_amount, total_amount, paid_amount, payment_released, payment_date,
         invoice_date, due_date, status, gst_file_name, gst_file_mime, gst_file_data, notes
       ) VALUES (?, ?, ?, ?, ?, 'FIXED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, clientId, req.body.openingId || null, req.body.candidateId || null,
        req.user.id, totals.serviceCharges, totals.gstType, totals.igst, totals.cgst,
        totals.sgst, totals.serviceCharges, totals.gstAmount, totals.totalAmount,
        totals.paidAmount, totals.paymentReleased, req.body.paymentDate || null,
        invoiceDate, req.body.dueDate || null, totals.status, file.name, file.mime, file.data,
        String(req.body.notes || '').trim() || null]
    );

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
    res.status(201).json({ success: true, message: 'Invoice created successfully.', data: { id: result.insertId } });
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
  if (!req.body.invoiceDate) throw new AppError('Invoice date is required.', 400);
  const clientId = idFrom(req.body.clientId, 'client ID');

  const [[client]] = await pool.query('SELECT id FROM clients WHERE id = ?', [clientId]);
  if (!client) throw new AppError('Client not found.', 404);

  const [[existing]] = await pool.query(
    'SELECT id, paid_amount, payment_date FROM invoices WHERE id = ? LIMIT 1',
    [id]
  );
  if (!existing) throw new AppError('Invoice not found.', 404);

  const [[duplicate]] = await pool.query(
    'SELECT id FROM invoices WHERE invoice_number = ? AND id <> ? LIMIT 1',
    [invoiceNumber, id]
  );
  if (duplicate) throw new AppError('Another invoice already uses this invoice number.', 409);

  const currentPaidAmount = money(existing.paid_amount);
  const totals = deriveTotals({ ...req.body, paidAmount: currentPaidAmount });
  if (totals.totalAmount < currentPaidAmount) {
    throw new AppError('Invoice total cannot be reduced below the amount already received.', 409);
  }
  const file = req.body.gstFile?.data ? parseFile(req.body.gstFile) : null;

  const params = [invoiceNumber, clientId, req.body.openingId || null, req.body.candidateId || null,
    totals.serviceCharges, totals.gstType, totals.igst, totals.cgst, totals.sgst,
    totals.serviceCharges, totals.gstAmount, totals.totalAmount, currentPaidAmount,
    currentPaidAmount > 0, existing.payment_date || null, req.body.invoiceDate,
    req.body.dueDate || null, totals.status, String(req.body.notes || '').trim() || null];

  let fileSql = '';
  if (file) {
    fileSql = ', gst_file_name = ?, gst_file_mime = ?, gst_file_data = ?';
    params.push(file.name, file.mime, file.data);
  }
  params.push(id);

  const [result] = await pool.query(
    `UPDATE invoices SET invoice_number = ?, client_id = ?, opening_id = ?, candidate_id = ?,
       service_charges = ?, gst_type = ?, igst_amount = ?, cgst_amount = ?, sgst_amount = ?,
       subtotal = ?, gst_amount = ?, total_amount = ?, paid_amount = ?, payment_released = ?,
       payment_date = ?, invoice_date = ?, due_date = ?, status = ?, notes = ? ${fileSql}
     WHERE id = ?`,
    params
  );
  if (!result.affectedRows) throw new AppError('Invoice not found.', 404);
  res.json({ success: true, message: 'Invoice updated successfully.' });
});

export const recordPayment = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const amount = money(req.body.amount);
  if (amount <= 0) throw new AppError('Payment amount must be greater than zero.', 400);
  const paymentDate = req.body.paymentDate;
  if (!paymentDate) throw new AppError('Payment date is required.', 400);

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
    const status = newPaid >= Number(invoice.total_amount) ? 'PAID' : 'PARTIALLY_PAID';
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

export const downloadGstFile = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const [[file]] = await pool.query(
    'SELECT gst_file_name, gst_file_mime, gst_file_data FROM invoices WHERE id = ?',
    [id]
  );
  if (!file?.gst_file_data) throw new AppError('GST file was not uploaded for this invoice.', 404);
  res.setHeader('Content-Type', file.gst_file_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${String(file.gst_file_name || 'gst-document').replaceAll('"', '')}"`);
  res.send(file.gst_file_data);
});

export const deleteInvoice = asyncHandler(async (req, res) => {
  const id = idFrom(req.params.id);
  const [[invoice]] = await pool.query('SELECT paid_amount FROM invoices WHERE id = ?', [id]);
  if (!invoice) throw new AppError('Invoice not found.', 404);
  if (Number(invoice.paid_amount || 0) > 0) throw new AppError('An invoice with payments cannot be deleted. Mark it Cancelled instead.', 409);
  await pool.query('DELETE FROM invoices WHERE id = ?', [id]);
  res.json({ success: true, message: 'Invoice deleted successfully.' });
});
