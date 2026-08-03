import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const allowedStatuses = [
  'OPEN',
  'SOURCING',
  'SCREENING',
  'INTERVIEW',
  'OFFERED',
  'JOINED',
  'CLOSED',
  'ON_HOLD'
];

const allowedPriorities = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT'
];
async function notifyOpeningTeam({
  actorId,
  type,
  title,
  message,
  referenceId,
  assignedRecruiterId = null
}) {
  const [recipients] = await pool.query(
    `SELECT id
     FROM employees
     WHERE status = 'ACTIVE'
       AND id <> ?
       AND (
         role IN (
           'SUPER_ADMIN',
           'ADMIN',
           'HR',
           'MANAGER'
         )
         OR id = ?
       )`,
    [actorId, assignedRecruiterId || 0]
  );

  if (!recipients.length) {
    return;
  }

  const placeholders = recipients
    .map(() => `(?, ?, ?, ?, ?, 'JOB_OPENING', ?)`)
    .join(', ');

  const values = [];

  for (const recipient of recipients) {
    values.push(
      recipient.id,
      actorId,
      type,
      title,
      message,
      referenceId
    );
  }

  await pool.query(
    `INSERT INTO notifications (
       recipient_id,
       actor_id,
       type,
       title,
       message,
       reference_type,
       reference_id
     )
     VALUES ${placeholders}`,
    values
  );
}

export const listOpenings = asyncHandler(async (req, res) => {
  const {
    search,
    clientId,
    status,
    priority,
    assignedRecruiterId
  } = req.query;

  const conditions = [];
  const values = [];

  if (clientId) {
    const parsedClientId = Number(clientId);

    if (!Number.isInteger(parsedClientId) || parsedClientId <= 0) {
      throw new AppError('Invalid client filter.', 400);
    }

    conditions.push('jo.client_id = ?');
    values.push(parsedClientId);
  }

  if (status && status !== 'ALL') {
    if (!allowedStatuses.includes(status)) {
      throw new AppError('Invalid opening status.', 400);
    }

    conditions.push('jo.status = ?');
    values.push(status);
  }

  if (priority && priority !== 'ALL') {
    if (!allowedPriorities.includes(priority)) {
      throw new AppError('Invalid opening priority.', 400);
    }

    conditions.push('jo.priority = ?');
    values.push(priority);
  }

  if (assignedRecruiterId) {
    const parsedRecruiterId = Number(assignedRecruiterId);

    if (!Number.isInteger(parsedRecruiterId) || parsedRecruiterId <= 0) {
      throw new AppError('Invalid employee filter.', 400);
    }

    conditions.push('jo.assigned_recruiter_id = ?');
    values.push(parsedRecruiterId);
  }

  const keyword = String(search || '').trim();

  if (keyword) {
    conditions.push(
      `LOWER(CONCAT_WS(
         ' ',
         c.company_name,
         jo.title,
         jo.location,
         e.full_name,
         e.employee_id,
         jo.status,
         jo.priority
       )) LIKE ?`
    );
    values.push(`%${keyword.toLowerCase()}%`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const [rows] = await pool.query(
    `SELECT
       jo.id,
       jo.client_id,
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
       c.company_name,
       e.employee_id AS assigned_recruiter_code,
       e.full_name AS assigned_recruiter_name,
       (
         SELECT COUNT(*)
         FROM candidate_applications ca
         WHERE ca.opening_id = jo.id
           AND ca.stage = 'JOINED'
       ) AS filled_positions
     FROM job_openings jo
     JOIN clients c
       ON c.id = jo.client_id
     LEFT JOIN employees e
       ON e.id = jo.assigned_recruiter_id
     ${whereClause}
     ORDER BY
       c.company_name ASC,
       jo.created_at DESC
     LIMIT 1000`,
    values
  );

  const data = rows.map((row) => ({
    ...row,
    openings_count: Number(row.openings_count || 0),
    filled_positions: Number(row.filled_positions || 0),
    remaining_positions: Math.max(
      Number(row.openings_count || 0) -
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
      clientId: clientId || null,
      status: status || 'ALL',
      priority: priority || 'ALL',
      assignedRecruiterId: assignedRecruiterId || null
    }
  });
});

export const getOpeningById = asyncHandler(
  async (req, res) => {
    const openingId = Number(req.params.id);

    if (!Number.isInteger(openingId) || openingId <= 0) {
      throw new AppError('Invalid opening ID.', 400);
    }

    const [[opening]] = await pool.query(
      `SELECT
         jo.*,
         c.company_name,
         c.industry,
         c.website,
         c.contact_name,
         c.contact_email,
         c.contact_phone,
         e.full_name AS assigned_recruiter_name,
         (
           SELECT COUNT(*)
           FROM candidate_applications ca
           WHERE ca.opening_id = jo.id
             AND ca.stage = 'JOINED'
         ) AS filled_positions
       FROM job_openings jo
       JOIN clients c
         ON c.id = jo.client_id
       LEFT JOIN employees e
         ON e.id = jo.assigned_recruiter_id
       WHERE jo.id = ?`,
      [openingId]
    );

    if (!opening) {
      throw new AppError('Opening not found.', 404);
    }

    opening.remaining_positions = Math.max(
      Number(opening.openings_count || 0) -
        Number(opening.filled_positions || 0),
      0
    );

    const [applications] = await pool.query(
      `SELECT
         ca.id,
         ca.stage,
         ca.assigned_recruiter_id,
         ca.last_updated,
         c.id AS candidate_id,
         c.full_name AS candidate_name,
         c.email AS candidate_email,
         c.phone AS candidate_phone,
         e.full_name AS assigned_recruiter_name
       FROM candidate_applications ca
       JOIN candidates c
         ON c.id = ca.candidate_id
       LEFT JOIN employees e
         ON e.id = ca.assigned_recruiter_id
       WHERE ca.opening_id = ?
       ORDER BY ca.last_updated DESC`,
      [openingId]
    );

    res.json({
      success: true,
      data: {
        opening,
        applications
      }
    });
  }
);

export const createOpening = asyncHandler(
  async (req, res) => {
    const {
      clientId,
      title,
      location,
      openingsCount = 1,
      experienceMin,
      experienceMax,
      assignedRecruiterId,
      priority = 'MEDIUM',
      status = 'OPEN',
      openedDate,
      targetCloseDate
    } = req.body;

    const parsedClientId = Number(clientId);
    const parsedOpeningsCount = Number(openingsCount);

    if (!Number.isInteger(parsedClientId) || parsedClientId <= 0) {
      throw new AppError('Select a valid client.', 400);
    }

    if (!title?.trim()) {
      throw new AppError('Job role is required.', 400);
    }

    if (
      !Number.isInteger(parsedOpeningsCount) ||
      parsedOpeningsCount <= 0
    ) {
      throw new AppError(
        'Openings count must be at least 1.',
        400
      );
    }

    const parsedExperienceMin =
      experienceMin === null ||
      experienceMin === undefined ||
      experienceMin === ''
        ? null
        : Number(experienceMin);

    const parsedExperienceMax =
      experienceMax === null ||
      experienceMax === undefined ||
      experienceMax === ''
        ? null
        : Number(experienceMax);

    if (
      parsedExperienceMin !== null &&
      (!Number.isFinite(parsedExperienceMin) ||
        parsedExperienceMin < 0)
    ) {
      throw new AppError(
        'Minimum experience must be zero or more.',
        400
      );
    }

    if (
      parsedExperienceMax !== null &&
      (!Number.isFinite(parsedExperienceMax) ||
        parsedExperienceMax < 0)
    ) {
      throw new AppError(
        'Maximum experience must be zero or more.',
        400
      );
    }

    if (
      parsedExperienceMin !== null &&
      parsedExperienceMax !== null &&
      parsedExperienceMax < parsedExperienceMin
    ) {
      throw new AppError(
        'Maximum experience cannot be lower than minimum experience.',
        400
      );
    }

    if (!allowedPriorities.includes(priority)) {
      throw new AppError('Invalid priority.', 400);
    }

    if (!allowedStatuses.includes(status)) {
      throw new AppError('Invalid opening status.', 400);
    }

    const parsedRecruiterId =
      assignedRecruiterId === null ||
      assignedRecruiterId === undefined ||
      assignedRecruiterId === ''
        ? null
        : Number(assignedRecruiterId);

    if (
      parsedRecruiterId !== null &&
      (!Number.isInteger(parsedRecruiterId) ||
        parsedRecruiterId <= 0)
    ) {
      throw new AppError('Invalid assigned employee.', 400);
    }

    const connection = await pool.getConnection();
    let committed = false;

    try {
      await connection.beginTransaction();

      const [[client]] = await connection.query(
        `SELECT id, company_name, status
         FROM clients
         WHERE id = ?
         LIMIT 1`,
        [parsedClientId]
      );

      if (!client) {
        throw new AppError('Client not found.', 404);
      }

      if (client.status === 'CLOSED') {
        throw new AppError(
          'A requirement cannot be created for a closed client.',
          409
        );
      }

      if (parsedRecruiterId !== null) {
        const [[employee]] = await connection.query(
          `SELECT id
           FROM employees
           WHERE id = ?
             AND status = 'ACTIVE'
             AND COALESCE(account_type, 'EMPLOYEE') = 'EMPLOYEE'
           LIMIT 1`,
          [parsedRecruiterId]
        );

        if (!employee) {
          throw new AppError(
            'Assigned employee not found or inactive.',
            404
          );
        }
      }

      const [result] = await connection.query(
        `INSERT INTO job_openings
         (
           client_id,
           title,
           location,
           openings_count,
           experience_min,
           experience_max,
           assigned_recruiter_id,
           priority,
           status,
           opened_date,
           target_close_date
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parsedClientId,
          title.trim(),
          location?.trim() || null,
          parsedOpeningsCount,
          parsedExperienceMin,
          parsedExperienceMax,
          parsedRecruiterId,
          priority,
          status,
          openedDate || null,
          targetCloseDate || null
        ]
      );

      const [[createdOpening]] = await connection.query(
        `SELECT
           jo.id,
           jo.client_id,
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
           jo.created_at,
           c.company_name,
           e.full_name AS assigned_recruiter_name
         FROM job_openings jo
         JOIN clients c
           ON c.id = jo.client_id
         LEFT JOIN employees e
           ON e.id = jo.assigned_recruiter_id
         WHERE jo.id = ?`,
        [result.insertId]
      );

      await connection.commit();
      committed = true;

      try {
        await notifyOpeningTeam({
          actorId: req.user.id,
          type: 'OPENING_CREATED',
          title: 'New Job Opening Created',
          message: `${title.trim()} opening was created for ${client.company_name}.`,
          referenceId: result.insertId,
          assignedRecruiterId: parsedRecruiterId
        });
      } catch (notificationError) {
        console.error(
          '[opening] Notification failed:',
          notificationError
        );
      }

      res.status(201).json({
        success: true,
        message: 'Requirement created successfully.',
        data: createdOpening
      });
    } catch (error) {
      if (!committed) {
        await connection.rollback();
      }
      throw error;
    } finally {
      connection.release();
    }
  }
);

export const updateOpening = asyncHandler(
  async (req, res) => {
    const openingId = Number(req.params.id);

    if (!Number.isInteger(openingId) || openingId <= 0) {
      throw new AppError('Invalid opening ID.', 400);
    }

    const [[existing]] = await pool.query(
      `SELECT *
       FROM job_openings
       WHERE id = ?`,
      [openingId]
    );

    if (!existing) {
      throw new AppError('Opening not found.', 404);
    }

    const clientId =
      req.body.clientId ?? existing.client_id;

    const title =
      req.body.title?.trim() || existing.title;

    const location =
      req.body.location !== undefined
        ? req.body.location?.trim() || null
        : existing.location;

    const openingsCount =
      req.body.openingsCount ??
      existing.openings_count;

    const experienceMin =
      req.body.experienceMin !== undefined
        ? req.body.experienceMin || null
        : existing.experience_min;

    const experienceMax =
      req.body.experienceMax !== undefined
        ? req.body.experienceMax || null
        : existing.experience_max;

    const assignedRecruiterId =
      req.body.assignedRecruiterId !== undefined
        ? req.body.assignedRecruiterId || null
        : existing.assigned_recruiter_id;

    const priority =
      req.body.priority || existing.priority;

    const status =
      req.body.status || existing.status;

    const openedDate =
      req.body.openedDate !== undefined
        ? req.body.openedDate || null
        : existing.opened_date;

    const targetCloseDate =
      req.body.targetCloseDate !== undefined
        ? req.body.targetCloseDate || null
        : existing.target_close_date;

   let closedDate = existing.closed_date;
let closedBy = existing.closed_by;

if (status === 'CLOSED' && existing.status !== 'CLOSED') {
  closedDate = new Date()
    .toISOString()
    .slice(0, 10);

  closedBy = req.user.id;
}

if (status !== 'CLOSED') {
  closedDate = null;
  closedBy = null;
}

    if (!allowedPriorities.includes(priority)) {
      throw new AppError('Invalid priority.', 400);
    }

    if (!allowedStatuses.includes(status)) {
      throw new AppError('Invalid opening status.', 400);
    }

const [[client]] = await pool.query(
  `SELECT id, company_name
   FROM clients
   WHERE id = ?`,
  [clientId]
);

    if (!client) {
      throw new AppError('Client not found.', 404);
    }

    if (assignedRecruiterId) {
      const [[employee]] = await pool.query(
        `SELECT id
         FROM employees
         WHERE id = ?
           AND status = 'ACTIVE'`,
        [assignedRecruiterId]
      );

      if (!employee) {
        throw new AppError(
          'Assigned employee not found or inactive.',
          404
        );
      }
    }

    await pool.query(
     `UPDATE job_openings
 SET
   client_id = ?,
   title = ?,
   location = ?,
   openings_count = ?,
   experience_min = ?,
   experience_max = ?,
   assigned_recruiter_id = ?,
   priority = ?,
   status = ?,
   opened_date = ?,
   target_close_date = ?,
   closed_date = ?,
   closed_by = ?
 WHERE id = ?`,
[
        clientId,
        title,
        location,
        openingsCount,
        experienceMin,
        experienceMax,
        assignedRecruiterId,
        priority,
        status,
        openedDate,
        targetCloseDate,
        closedDate,
        closedBy,
        openingId
      ]
    );

    res.json({
      success: true,
      message: 'Opening updated successfully.'
    });
  }
);