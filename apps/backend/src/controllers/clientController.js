import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const allowedStatuses = ['PROSPECT', 'ACTIVE', 'INACTIVE', 'CLOSED'];

function clientIdFrom(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid client ID.', 400);
  return id;
}

function clean(value) {
  return String(value || '').trim() || null;
}

function validateGst(gstNumber) {
  if (!gstNumber) return null;
  const value = gstNumber.trim().toUpperCase();
  if (!/^[0-9A-Z]{15}$/.test(value)) {
    throw new AppError('GST number must contain exactly 15 letters/numbers.', 400);
  }
  return value;
}

function mapPayload(body) {
  const status = body.status || 'PROSPECT';
  if (!allowedStatuses.includes(status)) throw new AppError('Invalid client status.', 400);

  return {
    companyName: clean(body.companyName),
    gstNumber: validateGst(clean(body.gstNumber)),
    addressLine: clean(body.addressLine),
    city: clean(body.city),
    state: clean(body.state),
    postalCode: clean(body.postalCode),
    industry: clean(body.industry),
    website: clean(body.website),
    companyEmail: clean(body.companyEmail),
    companyPhone: clean(body.companyPhone),
    contactPersonName: clean(body.contactPersonName),
    contactPersonEmail: clean(body.contactPersonEmail),
    contactPersonPhone: clean(body.contactPersonPhone),
    status
  };
}

export const listClients = asyncHandler(async (req, res) => {
  const conditions = [];
  const values = [];
  const status = String(req.query.status || '').trim();
  const keyword = String(req.query.search || '').trim().toLowerCase();

  if (status && status !== 'ALL') {
    if (!allowedStatuses.includes(status)) throw new AppError('Invalid client status.', 400);
    conditions.push('c.status = ?');
    values.push(status);
  }

  if (keyword) {
    conditions.push(`LOWER(CONCAT_WS(' ', c.company_name, c.gst_number, c.address_line,
      c.city, c.state, c.postal_code, c.industry, c.website, c.company_email,
      c.company_phone, c.contact_person_name, c.contact_person_email,
      c.contact_person_phone, c.status)) LIKE ?`);
    values.push(`%${keyword}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT c.id, c.company_name, c.gst_number, c.address_line, c.city, c.state,
       c.postal_code, c.industry, c.website, c.company_email, c.company_phone,
       c.contact_person_name, c.contact_person_email, c.contact_person_phone,
       c.contact_name, c.contact_email, c.contact_phone, c.onboarded_by, c.status,
       c.created_at, c.updated_at, e.full_name AS onboarded_by_name,
       (SELECT COUNT(*) FROM job_openings jo WHERE jo.client_id = c.id) AS total_openings,
       (SELECT COUNT(*) FROM job_openings jo WHERE jo.client_id = c.id AND jo.status <> 'CLOSED') AS active_openings,
       (SELECT COALESCE(SUM(jo.openings_count), 0) FROM job_openings jo WHERE jo.client_id = c.id) AS total_positions,
       (SELECT COUNT(*) FROM candidate_applications ca JOIN job_openings jo ON jo.id = ca.opening_id
          WHERE jo.client_id = c.id AND ca.stage = 'JOINED') AS filled_positions,
       (SELECT COUNT(*) FROM invoices i WHERE i.client_id = c.id) AS invoice_count
     FROM clients c
     LEFT JOIN employees e ON e.id = c.onboarded_by
     ${where}
     ORDER BY c.created_at DESC
     LIMIT 1000`,
    values
  );

  res.json({
    success: true,
    data: rows.map((row) => ({
      ...row,
      total_openings: Number(row.total_openings || 0),
      active_openings: Number(row.active_openings || 0),
      total_positions: Number(row.total_positions || 0),
      filled_positions: Number(row.filled_positions || 0),
      invoice_count: Number(row.invoice_count || 0),
      remaining_positions: Math.max(Number(row.total_positions || 0) - Number(row.filled_positions || 0), 0)
    })),
    meta: { search: keyword || null, status: status || 'ALL' }
  });
});


export const listClientReferences = asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, company_name, status
     FROM clients
     ORDER BY company_name ASC`
  );

  res.json({ success: true, data: rows });
});

export const getClientById = asyncHandler(async (req, res) => {
  const id = clientIdFrom(req.params.id);
  const [[client]] = await pool.query(
    `SELECT c.*, e.full_name AS onboarded_by_name
     FROM clients c
     LEFT JOIN employees e ON e.id = c.onboarded_by
     WHERE c.id = ?`,
    [id]
  );
  if (!client) throw new AppError('Client not found.', 404);
  res.json({ success: true, data: client });
});

export const createClient = asyncHandler(async (req, res) => {
  const client = mapPayload(req.body);
  if (!client.companyName) throw new AppError('Company name is required.', 400);

  const [duplicates] = await pool.query(
    `SELECT id FROM clients
     WHERE LOWER(company_name) = LOWER(?)
        OR (? IS NOT NULL AND gst_number = ?)
     LIMIT 1`,
    [client.companyName, client.gstNumber, client.gstNumber]
  );
  if (duplicates.length) throw new AppError('A client with this company name or GST number already exists.', 409);

  const [result] = await pool.query(
    `INSERT INTO clients (
       company_name, gst_number, address_line, city, state, postal_code, industry,
       website, company_email, company_phone, contact_person_name,
       contact_person_email, contact_person_phone, contact_name, contact_email,
       contact_phone, onboarded_by, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [client.companyName, client.gstNumber, client.addressLine, client.city, client.state,
      client.postalCode, client.industry, client.website, client.companyEmail,
      client.companyPhone, client.contactPersonName, client.contactPersonEmail,
      client.contactPersonPhone, client.contactPersonName,
      client.contactPersonEmail || client.companyEmail,
      client.contactPersonPhone || client.companyPhone, req.user.id, client.status]
  );

  res.status(201).json({ success: true, message: 'Client added successfully.', data: { id: result.insertId } });
});

export const updateClient = asyncHandler(async (req, res) => {
  const id = clientIdFrom(req.params.id);
  const client = mapPayload(req.body);
  if (!client.companyName) throw new AppError('Company name is required.', 400);

  const [duplicates] = await pool.query(
    `SELECT id FROM clients
     WHERE id <> ?
       AND (LOWER(company_name) = LOWER(?) OR (? IS NOT NULL AND gst_number = ?))
     LIMIT 1`,
    [id, client.companyName, client.gstNumber, client.gstNumber]
  );
  if (duplicates.length) throw new AppError('Another client already uses this company name or GST number.', 409);

  const [result] = await pool.query(
    `UPDATE clients SET
       company_name = ?, gst_number = ?, address_line = ?, city = ?, state = ?,
       postal_code = ?, industry = ?, website = ?, company_email = ?,
       company_phone = ?, contact_person_name = ?, contact_person_email = ?,
       contact_person_phone = ?, contact_name = ?, contact_email = ?,
       contact_phone = ?, status = ?
     WHERE id = ?`,
    [client.companyName, client.gstNumber, client.addressLine, client.city, client.state,
      client.postalCode, client.industry, client.website, client.companyEmail,
      client.companyPhone, client.contactPersonName, client.contactPersonEmail,
      client.contactPersonPhone, client.contactPersonName,
      client.contactPersonEmail || client.companyEmail,
      client.contactPersonPhone || client.companyPhone, client.status, id]
  );
  if (!result.affectedRows) throw new AppError('Client not found.', 404);
  res.json({ success: true, message: 'Client updated successfully.' });
});

export const deleteClient = asyncHandler(async (req, res) => {
  const id = clientIdFrom(req.params.id);
  const [[dependencies]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM job_openings WHERE client_id = ?) AS openings,
       (SELECT COUNT(*) FROM invoices WHERE client_id = ?) AS invoices,
       (SELECT COUNT(*) FROM candidate_employment_history WHERE client_id = ?) AS placements`,
    [id, id, id]
  );

  if (Number(dependencies.openings) || Number(dependencies.invoices) || Number(dependencies.placements)) {
    throw new AppError('This client has requirements, placements or invoices. Change its status to Inactive instead of deleting it.', 409);
  }

  const [result] = await pool.query('DELETE FROM clients WHERE id = ?', [id]);
  if (!result.affectedRows) throw new AppError('Client not found.', 404);
  res.json({ success: true, message: 'Client deleted successfully.' });
});
