import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const allowedStatuses = [
  'PROSPECT',
  'ACTIVE',
  'INACTIVE',
  'CLOSED'
];

function validateClientId(value) {
  const clientId = Number(value);

  if (!Number.isInteger(clientId) || clientId <= 0) {
    throw new AppError('Invalid client ID.', 400);
  }

  return clientId;
}

export const listClients = asyncHandler(async (req, res) => {
  const {
    search,
    status
  } = req.query;

  const conditions = [];
  const values = [];

  if (status && status !== 'ALL') {
    if (!allowedStatuses.includes(status)) {
      throw new AppError('Invalid client status.', 400);
    }

    conditions.push('c.status = ?');
    values.push(status);
  }

  const keyword = String(search || '').trim();

  if (keyword) {
    conditions.push(
      `LOWER(CONCAT_WS(
         ' ',
         c.company_name,
         c.industry,
         c.website,
         c.contact_name,
         c.contact_email,
         c.contact_phone,
         c.status
       )) LIKE ?`
    );
    values.push(`%${keyword.toLowerCase()}%`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const [rows] = await pool.query(
    `SELECT
       c.id,
       c.company_name,
       c.industry,
       c.website,
       c.contact_name,
       c.contact_email,
       c.contact_phone,
       c.onboarded_by,
       c.status,
       c.created_at,
       c.updated_at,
       e.full_name AS onboarded_by_name,

       (
         SELECT COUNT(*)
         FROM job_openings jo
         WHERE jo.client_id = c.id
       ) AS total_openings,

       (
         SELECT COUNT(*)
         FROM job_openings jo
         WHERE jo.client_id = c.id
           AND jo.status <> 'CLOSED'
       ) AS active_openings,

       (
         SELECT COUNT(*)
         FROM job_openings jo
         WHERE jo.client_id = c.id
           AND jo.status = 'CLOSED'
       ) AS closed_openings,

       (
         SELECT COALESCE(SUM(jo.openings_count), 0)
         FROM job_openings jo
         WHERE jo.client_id = c.id
       ) AS total_positions,

       (
         SELECT COUNT(*)
         FROM candidate_applications ca
         JOIN job_openings jo
           ON jo.id = ca.opening_id
         WHERE jo.client_id = c.id
           AND ca.stage = 'JOINED'
       ) AS filled_positions

     FROM clients c
     LEFT JOIN employees e
       ON e.id = c.onboarded_by
     ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT 1000`,
    values
  );

  const data = rows.map((row) => ({
    ...row,
    total_openings: Number(row.total_openings || 0),
    active_openings: Number(row.active_openings || 0),
    closed_openings: Number(row.closed_openings || 0),
    total_positions: Number(row.total_positions || 0),
    filled_positions: Number(row.filled_positions || 0),
    remaining_positions: Math.max(
      Number(row.total_positions || 0) -
        Number(row.filled_positions || 0),
      0
    )
  }));

  res.json({
    success: true,
    data,
    meta: {
      count: data.length,
      search: keyword || null,
      status: status || 'ALL'
    }
  });
});

export const getClientById = asyncHandler(async (req, res) => {
  const clientId = validateClientId(req.params.id);

  const [[client]] = await pool.query(
    `SELECT
       c.*,
       e.full_name AS onboarded_by_name
     FROM clients c
     LEFT JOIN employees e
       ON e.id = c.onboarded_by
     WHERE c.id = ?`,
    [clientId]
  );

  if (!client) {
    throw new AppError('Client not found.', 404);
  }

  const [openings] = await pool.query(
    `SELECT
       jo.id,
       jo.title,
       jo.location,
       jo.openings_count,
       jo.experience_min,
       jo.experience_max,
       jo.assigned_recruiter_id,
       jo.priority,
       jo.status,
       jo.opened_date,
       jo.target_close_date,
       jo.closed_date,
       jo.created_at,
       e.full_name AS assigned_recruiter_name,
       (
         SELECT COUNT(*)
         FROM candidate_applications ca
         WHERE ca.opening_id = jo.id
           AND ca.stage = 'JOINED'
       ) AS filled_positions
     FROM job_openings jo
     LEFT JOIN employees e
       ON e.id = jo.assigned_recruiter_id
     WHERE jo.client_id = ?
     ORDER BY jo.created_at DESC`,
    [clientId]
  );

  const formattedOpenings = openings.map((opening) => ({
    ...opening,
    openings_count: Number(opening.openings_count || 0),
    filled_positions: Number(opening.filled_positions || 0),
    remaining_positions: Math.max(
      Number(opening.openings_count || 0) -
        Number(opening.filled_positions || 0),
      0
    )
  }));

  res.json({
    success: true,
    data: {
      client,
      openings: formattedOpenings
    }
  });
});

export const createClient = asyncHandler(async (req, res) => {
  const companyName = req.body.companyName?.trim();
  const status = req.body.status || 'PROSPECT';

  if (!companyName) {
    throw new AppError('Company name is required.', 400);
  }

  if (!allowedStatuses.includes(status)) {
    throw new AppError('Invalid client status.', 400);
  }

  const [result] = await pool.query(
    `INSERT INTO clients
     (
       company_name,
       industry,
       website,
       contact_name,
       contact_email,
       contact_phone,
       onboarded_by,
       status
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyName,
      req.body.industry?.trim() || null,
      req.body.website?.trim() || null,
      req.body.contactName?.trim() || null,
      req.body.contactEmail?.trim() || null,
      req.body.contactPhone?.trim() || null,
      req.user.id,
      status
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Client created successfully.',
    data: {
      id: result.insertId
    }
  });
});

export const updateClient = asyncHandler(async (req, res) => {
  const clientId = validateClientId(req.params.id);

  const [[existing]] = await pool.query(
    `SELECT *
     FROM clients
     WHERE id = ?`,
    [clientId]
  );

  if (!existing) {
    throw new AppError('Client not found.', 404);
  }

  const companyName =
    req.body.companyName !== undefined
      ? req.body.companyName?.trim()
      : existing.company_name;

  if (!companyName) {
    throw new AppError('Company name is required.', 400);
  }

  const status =
    req.body.status !== undefined
      ? req.body.status
      : existing.status;

  if (!allowedStatuses.includes(status)) {
    throw new AppError('Invalid client status.', 400);
  }

  const industry =
    req.body.industry !== undefined
      ? req.body.industry?.trim() || null
      : existing.industry;

  const website =
    req.body.website !== undefined
      ? req.body.website?.trim() || null
      : existing.website;

  const contactName =
    req.body.contactName !== undefined
      ? req.body.contactName?.trim() || null
      : existing.contact_name;

  const contactEmail =
    req.body.contactEmail !== undefined
      ? req.body.contactEmail?.trim() || null
      : existing.contact_email;

  const contactPhone =
    req.body.contactPhone !== undefined
      ? req.body.contactPhone?.trim() || null
      : existing.contact_phone;

  await pool.query(
    `UPDATE clients
     SET
       company_name = ?,
       industry = ?,
       website = ?,
       contact_name = ?,
       contact_email = ?,
       contact_phone = ?,
       status = ?
     WHERE id = ?`,
    [
      companyName,
      industry,
      website,
      contactName,
      contactEmail,
      contactPhone,
      status,
      clientId
    ]
  );

  res.json({
    success: true,
    message: 'Client updated successfully.'
  });
});

export const deleteClient = asyncHandler(async (req, res) => {
  const clientId = validateClientId(req.params.id);

  const [[client]] = await pool.query(
    `SELECT id, company_name
     FROM clients
     WHERE id = ?`,
    [clientId]
  );

  if (!client) {
    throw new AppError('Client not found.', 404);
  }

  const [[openingCount]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM job_openings
     WHERE client_id = ?`,
    [clientId]
  );

  if (Number(openingCount.total) > 0) {
    throw new AppError(
      'This client has opening history and cannot be deleted. Mark the client as Former Client instead.',
      409
    );
  }

  await pool.query(
    `DELETE FROM clients
     WHERE id = ?`,
    [clientId]
  );

  res.json({
    success: true,
    message: 'Client deleted successfully.'
  });
});