import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const allowedStages = ['SOURCED','SCREENING','SHORTLISTED','INTERVIEW','OFFERED','JOINED','REJECTED','WITHDRAWN'];
const allowedEmploymentStatuses = ['OFFERED','JOINED','ACTIVE','LEFT','NO_SHOW','TERMINATED'];

function positiveId(value, label = 'ID') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(`Invalid ${label}.`, 400);
  return id;
}

function asNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function notifyRecruitmentTeam({ actorId, type, title, message, referenceId }) {
  const [recipients] = await pool.query(
    `SELECT id FROM employees
     WHERE role IN ('SUPER_ADMIN','ADMIN','HR','MANAGER')
       AND status = 'ACTIVE' AND id <> ?`,
    [actorId]
  );
  if (!recipients.length) return;

  const placeholders = recipients.map(() => `(?, ?, ?, ?, ?, 'CANDIDATE_APPLICATION', ?)`).join(', ');
  const values = [];
  recipients.forEach((recipient) => values.push(recipient.id, actorId, type, title, message, referenceId || null));
  try {
    await pool.query(
      `INSERT INTO notifications (recipient_id, actor_id, type, title, message, reference_type, reference_id)
       VALUES ${placeholders}`,
      values
    );
  } catch (error) {
    console.error('Candidate notification could not be created:', error.message);
  }
}

export const listCandidates = asyncHandler(async (req, res) => {
  const conditions = [];
  const values = [];
  const stage = String(req.query.stage || '').trim();
  const keyword = String(req.query.search || '').trim().toLowerCase();

  if (stage && stage !== 'ALL') {
    if (!allowedStages.includes(stage)) throw new AppError('Invalid candidate stage.', 400);
    conditions.push('application.stage = ?');
    values.push(stage);
  }
  if (req.query.openingId) {
    conditions.push('application.opening_id = ?');
    values.push(positiveId(req.query.openingId, 'opening filter'));
  }
  if (req.query.assignedRecruiterId) {
    conditions.push('application.assigned_recruiter_id = ?');
    values.push(positiveId(req.query.assignedRecruiterId, 'employee filter'));
  }
  if (keyword) {
    conditions.push(`LOWER(CONCAT_WS(' ', candidate.full_name, candidate.email, candidate.phone,
      candidate.current_location, candidate.preferred_location, candidate.skills,
      application.stage, opening.title, client.company_name, recruiter.full_name,
      latest_history.company_name_snapshot, latest_history.position, latest_history.employment_status)) LIKE ?`);
    values.push(`%${keyword}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT candidate.id, candidate.full_name, candidate.email, candidate.phone,
       candidate.current_location, candidate.preferred_location, candidate.total_experience,
       candidate.current_ctc, candidate.expected_ctc, candidate.notice_period_days,
       candidate.skills, candidate.created_at, creator.full_name AS added_by_name,
       application.id AS application_id, application.stage, application.assigned_recruiter_id,
       application.last_updated, opening.id AS opening_id, opening.title AS job_role,
       opening.status AS opening_status, client.id AS client_id, client.company_name,
       recruiter.full_name AS assigned_recruiter_name,
       latest_history.id AS latest_history_id,
       latest_history.company_name_snapshot AS latest_company,
       latest_history.position AS latest_position,
       latest_history.ctc AS latest_ctc,
       latest_history.joining_date AS latest_joining_date,
       latest_history.leaving_date AS latest_leaving_date,
       latest_history.employment_status AS latest_employment_status,
       (SELECT COUNT(*) FROM candidate_employment_history h WHERE h.candidate_id = candidate.id) AS history_count
     FROM candidates candidate
     LEFT JOIN employees creator ON creator.id = candidate.created_by
     LEFT JOIN candidate_applications application ON application.candidate_id = candidate.id
     LEFT JOIN job_openings opening ON opening.id = application.opening_id
     LEFT JOIN clients client ON client.id = opening.client_id
     LEFT JOIN employees recruiter ON recruiter.id = application.assigned_recruiter_id
     LEFT JOIN candidate_employment_history latest_history
       ON latest_history.id = (
         SELECT h2.id FROM candidate_employment_history h2
         WHERE h2.candidate_id = candidate.id
         ORDER BY COALESCE(h2.joining_date, '1000-01-01') DESC, h2.id DESC
         LIMIT 1
       )
     ${where}
     ORDER BY candidate.created_at DESC, application.last_updated DESC
     LIMIT 1000`,
    values
  );

  res.json({
    success: true,
    data: rows.map((row) => ({ ...row, history_count: Number(row.history_count || 0) })),
    meta: { count: rows.length, search: keyword || null, stage: stage || 'ALL' }
  });
});

export const createCandidate = asyncHandler(async (req, res) => {
  const body = req.body;
  const fullName = String(body.fullName || '').trim();
  const email = String(body.email || '').trim() || null;
  const phone = String(body.phone || '').trim() || null;
  if (!fullName) throw new AppError('Candidate name is required.', 400);
  if (!email && !phone) throw new AppError('Candidate phone number or email is required.', 400);

  const finalStage = body.stage || 'SOURCED';
  if (!allowedStages.includes(finalStage)) throw new AppError('Invalid candidate stage.', 400);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let candidateId = null;
    if (email) {
      const [[existing]] = await connection.query('SELECT id FROM candidates WHERE email = ? LIMIT 1', [email]);
      candidateId = existing?.id || null;
    }
    if (!candidateId && phone) {
      const [[existing]] = await connection.query('SELECT id FROM candidates WHERE phone = ? LIMIT 1', [phone]);
      candidateId = existing?.id || null;
    }

    if (candidateId && !body.openingId) {
      throw new AppError('A candidate with this email or phone number already exists.', 409);
    }

    if (!candidateId) {
      const [result] = await connection.query(
        `INSERT INTO candidates (full_name, email, phone, current_location, preferred_location,
           total_experience, current_ctc, expected_ctc, notice_period_days, skills, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [fullName, email, phone, String(body.currentLocation || '').trim() || null,
          String(body.preferredLocation || '').trim() || null, asNumber(body.totalExperience),
          asNumber(body.currentCtc), asNumber(body.expectedCtc), asNumber(body.noticePeriodDays),
          String(body.skills || '').trim() || null, req.user.id]
      );
      candidateId = result.insertId;
    }

    if (body.openingId) {
      const openingId = positiveId(body.openingId, 'opening ID');
      const [[opening]] = await connection.query('SELECT id, status FROM job_openings WHERE id = ?', [openingId]);
      if (!opening) throw new AppError('Job opening not found.', 404);
      if (opening.status === 'CLOSED') throw new AppError('Candidate cannot be added to a closed opening.', 409);
      const [[existingApplication]] = await connection.query(
        'SELECT id FROM candidate_applications WHERE candidate_id = ? AND opening_id = ? LIMIT 1',
        [candidateId, openingId]
      );
      if (existingApplication) throw new AppError('This candidate is already added to the selected opening.', 409);
      await connection.query(
        `INSERT INTO candidate_applications (candidate_id, opening_id, stage, assigned_recruiter_id)
         VALUES (?, ?, ?, ?)`,
        [candidateId, openingId, finalStage, req.user.id]
      );
    }

    await connection.commit();
    await notifyRecruitmentTeam({
      actorId: req.user.id,
      type: body.openingId ? 'CANDIDATE_LINKED' : 'CANDIDATE_ADDED',
      title: body.openingId ? 'Candidate Added to Opening' : 'New Candidate Added',
      message: `${fullName} was added to the candidate database.`,
      referenceId: candidateId
    });

    res.status(201).json({ success: true, message: 'Candidate saved successfully.', data: { id: candidateId } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const updateCandidate = asyncHandler(async (req, res) => {
  const id = positiveId(req.params.id, 'candidate ID');
  const fullName = String(req.body.fullName || '').trim();
  if (!fullName) throw new AppError('Candidate name is required.', 400);
  const email = String(req.body.email || '').trim() || null;
  const phone = String(req.body.phone || '').trim() || null;
  if (!email && !phone) throw new AppError('Candidate phone number or email is required.', 400);

  const [[duplicate]] = await pool.query(
    `SELECT id FROM candidates
     WHERE id <> ?
       AND ((? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?))
     LIMIT 1`,
    [id, email, email, phone, phone]
  );
  if (duplicate) throw new AppError('Another candidate already uses this email or phone number.', 409);

  const [result] = await pool.query(
    `UPDATE candidates SET full_name = ?, email = ?, phone = ?, current_location = ?,
       preferred_location = ?, total_experience = ?, current_ctc = ?, expected_ctc = ?,
       notice_period_days = ?, skills = ? WHERE id = ?`,
    [fullName, email, phone,
      String(req.body.currentLocation || '').trim() || null, String(req.body.preferredLocation || '').trim() || null,
      asNumber(req.body.totalExperience), asNumber(req.body.currentCtc), asNumber(req.body.expectedCtc),
      asNumber(req.body.noticePeriodDays), String(req.body.skills || '').trim() || null, id]
  );
  if (!result.affectedRows) throw new AppError('Candidate not found.', 404);
  res.json({ success: true, message: 'Candidate updated successfully.' });
});

export const updateCandidateStage = asyncHandler(async (req, res) => {
  const applicationId = positiveId(req.params.applicationId, 'candidate application ID');
  const stage = req.body.stage;
  if (!allowedStages.includes(stage)) throw new AppError('Invalid candidate stage.', 400);

  const [[application]] = await pool.query(
    `SELECT ca.id, ca.stage AS current_stage, jo.status AS opening_status, jo.title AS job_role,
       candidate.full_name AS candidate_name, client.company_name
     FROM candidate_applications ca
     JOIN candidates candidate ON candidate.id = ca.candidate_id
     JOIN job_openings jo ON jo.id = ca.opening_id
     JOIN clients client ON client.id = jo.client_id
     WHERE ca.id = ?`,
    [applicationId]
  );
  if (!application) throw new AppError('Candidate application not found.', 404);
  if (application.opening_status === 'CLOSED') throw new AppError('A candidate stage cannot be changed after the position is closed.', 409);

  await pool.query(
    `UPDATE candidate_applications SET stage = ?, assigned_recruiter_id = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`,
    [stage, req.user.id, applicationId]
  );
  await notifyRecruitmentTeam({
    actorId: req.user.id,
    type: 'CANDIDATE_STAGE_UPDATED',
    title: 'Candidate Stage Updated',
    message: `${application.candidate_name} for ${application.job_role} at ${application.company_name} moved to ${stage.replaceAll('_', ' ')}.`,
    referenceId: applicationId
  });
  res.json({ success: true, message: 'Candidate stage updated successfully.' });
});

export const getCandidateHistory = asyncHandler(async (req, res) => {
  const candidateId = positiveId(req.params.id, 'candidate ID');
  const [rows] = await pool.query(
    `SELECT h.id, h.candidate_id, h.client_id, h.company_name_snapshot, h.position,
       h.ctc, h.joining_date, h.leaving_date, h.employment_status,
       h.reason_for_leaving, h.notes, h.created_at, h.updated_at,
       c.company_name, e.full_name AS recorded_by_name
     FROM candidate_employment_history h
     LEFT JOIN clients c ON c.id = h.client_id
     LEFT JOIN employees e ON e.id = h.recorded_by
     WHERE h.candidate_id = ?
     ORDER BY COALESCE(h.joining_date, '1000-01-01') DESC, h.id DESC`,
    [candidateId]
  );
  res.json({ success: true, data: rows });
});

function validateHistoryPayload(body) {
  const clientId = positiveId(body.clientId, 'company');
  const position = String(body.position || '').trim();
  if (!position) throw new AppError('Position is required.', 400);
  const status = body.employmentStatus || 'JOINED';
  if (!allowedEmploymentStatuses.includes(status)) throw new AppError('Invalid employment status.', 400);
  if (body.joiningDate && body.leavingDate && body.leavingDate < body.joiningDate) {
    throw new AppError('Leaving date cannot be earlier than joining date.', 400);
  }
  return { clientId, position, ctc: Math.max(asNumber(body.ctc) || 0, 0), status };
}

export const createCandidateHistory = asyncHandler(async (req, res) => {
  const candidateId = positiveId(req.params.id, 'candidate ID');
  const values = validateHistoryPayload(req.body);
  const [[candidate]] = await pool.query('SELECT id FROM candidates WHERE id = ?', [candidateId]);
  if (!candidate) throw new AppError('Candidate not found.', 404);
  const [[client]] = await pool.query('SELECT id, company_name FROM clients WHERE id = ?', [values.clientId]);
  if (!client) throw new AppError('Company not found.', 404);

  const [result] = await pool.query(
    `INSERT INTO candidate_employment_history (
       candidate_id, client_id, company_name_snapshot, position, ctc, joining_date,
       leaving_date, employment_status, reason_for_leaving, notes, recorded_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [candidateId, client.id, client.company_name, values.position, values.ctc,
      req.body.joiningDate || null, req.body.leavingDate || null, values.status,
      String(req.body.reasonForLeaving || '').trim() || null,
      String(req.body.notes || '').trim() || null, req.user.id]
  );
  res.status(201).json({ success: true, message: 'Candidate employment history added.', data: { id: result.insertId } });
});

export const updateCandidateHistory = asyncHandler(async (req, res) => {
  const candidateId = positiveId(req.params.id, 'candidate ID');
  const historyId = positiveId(req.params.historyId, 'history ID');
  const values = validateHistoryPayload(req.body);
  const [[client]] = await pool.query('SELECT id, company_name FROM clients WHERE id = ?', [values.clientId]);
  if (!client) throw new AppError('Company not found.', 404);

  const [result] = await pool.query(
    `UPDATE candidate_employment_history SET client_id = ?, company_name_snapshot = ?,
       position = ?, ctc = ?, joining_date = ?, leaving_date = ?, employment_status = ?,
       reason_for_leaving = ?, notes = ? WHERE id = ? AND candidate_id = ?`,
    [client.id, client.company_name, values.position, values.ctc, req.body.joiningDate || null,
      req.body.leavingDate || null, values.status, String(req.body.reasonForLeaving || '').trim() || null,
      String(req.body.notes || '').trim() || null, historyId, candidateId]
  );
  if (!result.affectedRows) throw new AppError('Candidate history record not found.', 404);
  res.json({ success: true, message: 'Candidate employment history updated.' });
});

export const deleteCandidateHistory = asyncHandler(async (req, res) => {
  const candidateId = positiveId(req.params.id, 'candidate ID');
  const historyId = positiveId(req.params.historyId, 'history ID');
  const [result] = await pool.query('DELETE FROM candidate_employment_history WHERE id = ? AND candidate_id = ?', [historyId, candidateId]);
  if (!result.affectedRows) throw new AppError('Candidate history record not found.', 404);
  res.json({ success: true, message: 'Candidate employment history deleted.' });
});
