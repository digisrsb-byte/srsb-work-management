import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const allowedStages = ['SOURCED','SCREENING','SHORTLISTED','INTERVIEW','OFFERED','JOINED','REJECTED','WITHDRAWN'];
const allowedEmploymentStatuses = ['OFFERED','JOINED','ACTIVE','LEFT','NO_SHOW','TERMINATED'];
const allowedSources = ['JOB_PORTAL','REFERRAL','WALK_IN','LINKEDIN','COMPANY_WEBSITE','EXISTING_DATABASE','OTHER'];

function positiveId(value, label = 'ID') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(`Invalid ${label}.`, 400);
  return id;
}

function optionalId(value, label = 'ID') {
  if (value === '' || value === null || value === undefined) return null;
  return positiveId(value, label);
}

function asNumber(value, { minimum = 0 } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) throw new AppError('Enter a valid numeric value.', 400);
  return Math.round(number * 100) / 100;
}

function isoDateOrNull(value, label) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AppError(`Select a valid ${label}.`, 400);
  return text;
}

async function notifyRecruitmentTeam({ actorId, type, title, message, referenceId }) {
  const [recipients] = await pool.query(
    `SELECT id FROM employees
     WHERE role IN ('SUPER_ADMIN','ADMIN','HR','MANAGER','RECRUITER')
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

export const getCandidateReferenceData = asyncHandler(async (req, res) => {
  const [clients, openings, recruiters] = await Promise.all([
    pool.query(
      `SELECT id, company_name, gst_number, state, state_code
       FROM clients
       WHERE status IN ('ACTIVE','PROSPECT')
       ORDER BY company_name`
    ),
    pool.query(
      `SELECT jo.id, jo.client_id, jo.title, jo.location, jo.status, jo.assigned_recruiter_id,
         c.company_name
       FROM job_openings jo
       JOIN clients c ON c.id = jo.client_id
       WHERE jo.status NOT IN ('CLOSED','ON_HOLD')
         AND c.status <> 'CLOSED'
       ORDER BY c.company_name, jo.title`
    ),
    pool.query(
      `SELECT id, employee_id, full_name, designation
       FROM employees
       WHERE status = 'ACTIVE' AND COALESCE(account_type, 'EMPLOYEE') = 'EMPLOYEE'
       ORDER BY full_name`
    )
  ]);

  res.json({
    success: true,
    data: {
      clients: clients[0],
      openings: openings[0],
      recruiters: recruiters[0],
      sources: allowedSources
    }
  });
});

export const listCandidatePlacements = asyncHandler(async (req, res) => {
  const conditions = ["h.employment_status IN ('OFFERED','JOINED','ACTIVE')"];
  const values = [];
  if (req.query.clientId) {
    conditions.push('h.client_id = ?');
    values.push(positiveId(req.query.clientId, 'client filter'));
  }
  if (req.query.candidateId) {
    conditions.push('h.candidate_id = ?');
    values.push(positiveId(req.query.candidateId, 'candidate filter'));
  }

  const [rows] = await pool.query(
    `SELECT h.id AS placement_history_id, h.candidate_id, h.client_id, h.application_id,
       h.opening_id, h.company_name_snapshot, h.position, h.location, h.joining_date,
       h.gross_salary, h.offered_ctc, h.ctc, h.placement_fee, h.replacement_period_days,
       h.employment_status, c.full_name AS candidate_name, c.email AS candidate_email,
       c.phone AS candidate_phone, jo.title AS requirement_title,
       recruiter.full_name AS recruiter_name, client.company_name
     FROM candidate_employment_history h
     JOIN candidates c ON c.id = h.candidate_id
     LEFT JOIN job_openings jo ON jo.id = h.opening_id
     LEFT JOIN employees recruiter ON recruiter.id = h.recruiter_id
     LEFT JOIN clients client ON client.id = h.client_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY client.company_name, c.full_name, h.id DESC`,
    values
  );
  res.json({ success: true, data: rows });
});

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
      candidate.candidate_source, candidate.source_details, application.stage,
      opening.title, client.company_name, recruiter.full_name,
      latest_history.company_name_snapshot, latest_history.position,
      latest_history.location, latest_history.employment_status)) LIKE ?`);
    values.push(`%${keyword}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT candidate.id, candidate.full_name, candidate.email, candidate.phone,
       candidate.date_of_birth, candidate.candidate_source, candidate.source_details,
       candidate.enrollment_date, candidate.current_location, candidate.preferred_location,
       candidate.total_experience, candidate.current_ctc, candidate.expected_ctc,
       candidate.notice_period_days, candidate.skills, candidate.created_at,
       creator.full_name AS enrolled_by_name,
       application.id AS application_id, application.stage, application.assigned_recruiter_id,
       application.sourced_date, application.sourcing_notes, application.last_updated,
       opening.id AS opening_id, opening.title AS job_role, opening.location AS requirement_location,
       opening.status AS opening_status, client.id AS client_id, client.company_name,
       recruiter.full_name AS assigned_recruiter_name,
       latest_history.id AS latest_history_id,
       latest_history.company_name_snapshot AS latest_company,
       latest_history.position AS latest_position,
       latest_history.location AS latest_location,
       COALESCE(NULLIF(latest_history.offered_ctc, 0), latest_history.ctc) AS latest_ctc,
       latest_history.gross_salary AS latest_gross_salary,
       latest_history.joining_date AS latest_joining_date,
       latest_history.leaving_date AS latest_leaving_date,
       latest_history.employment_status AS latest_employment_status,
       (SELECT COUNT(*) FROM candidate_employment_history h WHERE h.candidate_id = candidate.id) AS history_count,
       (SELECT COUNT(*) FROM candidate_applications a2 WHERE a2.candidate_id = candidate.id) AS sourcing_count
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
     LIMIT 2000`,
    values
  );

  res.json({
    success: true,
    data: rows.map((row) => ({
      ...row,
      history_count: Number(row.history_count || 0),
      sourcing_count: Number(row.sourcing_count || 0)
    })),
    meta: { count: rows.length, search: keyword || null, stage: stage || 'ALL' }
  });
});

function candidatePayload(body) {
  const fullName = String(body.fullName || '').trim();
  const email = String(body.email || '').trim() || null;
  const phone = String(body.phone || '').trim() || null;
  if (!fullName) throw new AppError('Candidate name is required.', 400);
  if (!email && !phone) throw new AppError('Candidate phone number or email is required.', 400);
  const source = String(body.candidateSource || 'OTHER').trim().toUpperCase();
  if (!allowedSources.includes(source)) throw new AppError('Select a valid candidate source.', 400);
  return {
    fullName,
    email,
    phone,
    dateOfBirth: isoDateOrNull(body.dateOfBirth, 'date of birth'),
    source,
    sourceDetails: String(body.sourceDetails || '').trim() || null,
    enrollmentDate: isoDateOrNull(body.enrollmentDate, 'enrolment date'),
    currentLocation: String(body.currentLocation || '').trim() || null,
    preferredLocation: String(body.preferredLocation || '').trim() || null,
    totalExperience: asNumber(body.totalExperience),
    currentCtc: asNumber(body.currentCtc),
    expectedCtc: asNumber(body.expectedCtc),
    noticePeriodDays: asNumber(body.noticePeriodDays),
    skills: String(body.skills || '').trim() || null
  };
}

async function createApplication(connection, candidateId, body, actorId) {
  if (!body.openingId) return null;
  const openingId = positiveId(body.openingId, 'job requirement');
  const finalStage = body.stage || 'SOURCED';
  if (!allowedStages.includes(finalStage)) throw new AppError('Invalid candidate stage.', 400);
  const [[opening]] = await connection.query(
    `SELECT id, status FROM job_openings WHERE id = ?`,
    [openingId]
  );
  if (!opening) throw new AppError('Job requirement not found.', 404);
  if (['CLOSED','ON_HOLD'].includes(opening.status)) {
    throw new AppError('Candidate cannot be sourced for a closed or on-hold requirement.', 409);
  }
  const [[existingApplication]] = await connection.query(
    'SELECT id FROM candidate_applications WHERE candidate_id = ? AND opening_id = ? LIMIT 1',
    [candidateId, openingId]
  );
  if (existingApplication) throw new AppError('This candidate is already sourced for the selected requirement.', 409);
  const recruiterId = optionalId(body.assignedRecruiterId, 'recruiter') || actorId;
  const [result] = await connection.query(
    `INSERT INTO candidate_applications (
       candidate_id, opening_id, stage, assigned_recruiter_id, sourced_date, sourcing_notes
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [candidateId, openingId, finalStage, recruiterId,
      isoDateOrNull(body.sourcedDate, 'sourced date') || new Date().toISOString().slice(0, 10),
      String(body.sourcingNotes || '').trim() || null]
  );
  return result.insertId;
}

export const createCandidate = asyncHandler(async (req, res) => {
  const data = candidatePayload(req.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let candidateId = null;
    if (data.email) {
      const [[existing]] = await connection.query('SELECT id FROM candidates WHERE email = ? LIMIT 1', [data.email]);
      candidateId = existing?.id || null;
    }
    if (!candidateId && data.phone) {
      const [[existing]] = await connection.query('SELECT id FROM candidates WHERE phone = ? LIMIT 1', [data.phone]);
      candidateId = existing?.id || null;
    }
    if (candidateId && !req.body.openingId) {
      throw new AppError('A candidate with this email or phone number already exists.', 409);
    }

    if (!candidateId) {
      const [result] = await connection.query(
        `INSERT INTO candidates (
           full_name, email, phone, date_of_birth, candidate_source, source_details,
           enrollment_date, current_location, preferred_location, total_experience,
           current_ctc, expected_ctc, notice_period_days, skills, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.fullName, data.email, data.phone, data.dateOfBirth, data.source,
          data.sourceDetails, data.enrollmentDate || new Date().toISOString().slice(0, 10),
          data.currentLocation, data.preferredLocation, data.totalExperience,
          data.currentCtc, data.expectedCtc, data.noticePeriodDays, data.skills, req.user.id]
      );
      candidateId = result.insertId;
    }

    const applicationId = await createApplication(connection, candidateId, req.body, req.user.id);
    await connection.commit();

    await notifyRecruitmentTeam({
      actorId: req.user.id,
      type: applicationId ? 'CANDIDATE_LINKED' : 'CANDIDATE_ENROLLED',
      title: applicationId ? 'Candidate Sourced for Requirement' : 'Candidate Enrolled',
      message: `${data.fullName} was enrolled in the SRSB candidate database.`,
      referenceId: candidateId
    });

    res.status(201).json({
      success: true,
      message: applicationId ? 'Candidate enrolled and sourced successfully.' : 'Candidate enrolled successfully.',
      data: { id: candidateId, applicationId }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const updateCandidate = asyncHandler(async (req, res) => {
  const id = positiveId(req.params.id, 'candidate ID');
  const data = candidatePayload(req.body);
  const [[duplicate]] = await pool.query(
    `SELECT id FROM candidates
     WHERE id <> ? AND ((? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?))
     LIMIT 1`,
    [id, data.email, data.email, data.phone, data.phone]
  );
  if (duplicate) throw new AppError('Another candidate already uses this email or phone number.', 409);

  const [result] = await pool.query(
    `UPDATE candidates SET full_name = ?, email = ?, phone = ?, date_of_birth = ?,
       candidate_source = ?, source_details = ?, enrollment_date = ?, current_location = ?,
       preferred_location = ?, total_experience = ?, current_ctc = ?, expected_ctc = ?,
       notice_period_days = ?, skills = ? WHERE id = ?`,
    [data.fullName, data.email, data.phone, data.dateOfBirth, data.source, data.sourceDetails,
      data.enrollmentDate, data.currentLocation, data.preferredLocation, data.totalExperience,
      data.currentCtc, data.expectedCtc, data.noticePeriodDays, data.skills, id]
  );
  if (!result.affectedRows) throw new AppError('Candidate not found.', 404);
  res.json({ success: true, message: 'Candidate updated successfully.' });
});

export const deleteCandidate = asyncHandler(async (req, res) => {
  const candidateId = positiveId(req.params.id, 'candidate ID');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[candidate]] = await connection.query(
      'SELECT id, full_name FROM candidates WHERE id = ? FOR UPDATE',
      [candidateId]
    );

    if (!candidate) throw new AppError('Candidate not found.', 404);

    await connection.query(
      `INSERT INTO audit_logs (
         employee_id, action, entity_type, entity_id,
         old_values, new_values, ip_address
       ) VALUES (?, 'CANDIDATE_DELETED', 'CANDIDATE', ?, ?, NULL, ?)`,
      [req.user.id, String(candidateId), JSON.stringify(candidate), req.ip || null]
    );

    const [result] = await connection.query(
      'DELETE FROM candidates WHERE id = ?',
      [candidateId]
    );

    if (!result.affectedRows) throw new AppError('Candidate not found.', 404);

    await connection.commit();
    res.json({
      success: true,
      message: `${candidate.full_name} deleted successfully.`
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
export const linkCandidateApplication = asyncHandler(async (req, res) => {
  const candidateId = positiveId(req.params.id, 'candidate ID');
  const [[candidate]] = await pool.query('SELECT id, full_name FROM candidates WHERE id = ?', [candidateId]);
  if (!candidate) throw new AppError('Candidate not found.', 404);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const applicationId = await createApplication(connection, candidateId, req.body, req.user.id);
    if (!applicationId) throw new AppError('Select a company job requirement.', 400);
    await connection.commit();
    await notifyRecruitmentTeam({
      actorId: req.user.id,
      type: 'CANDIDATE_LINKED',
      title: 'Candidate Sourced for Requirement',
      message: `${candidate.full_name} was sourced for another company requirement.`,
      referenceId: applicationId
    });
    res.status(201).json({ success: true, message: 'Sourcing record added successfully.', data: { id: applicationId } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  if (!application) throw new AppError('Candidate sourcing record not found.', 404);
  if (application.opening_status === 'CLOSED' && stage !== application.current_stage) {
    throw new AppError('Candidate stage cannot be changed after the requirement is closed.', 409);
  }

  await pool.query(
    `UPDATE candidate_applications SET stage = ?, assigned_recruiter_id = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`,
    [stage, optionalId(req.body.assignedRecruiterId, 'recruiter') || req.user.id, applicationId]
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

export const deleteCandidateApplication = asyncHandler(async (req, res) => {
  const candidateId = positiveId(req.params.id, 'candidate ID');
  const applicationId = positiveId(req.params.applicationId, 'sourcing record ID');
  const [[placement]] = await pool.query(
    'SELECT id FROM candidate_employment_history WHERE application_id = ? LIMIT 1',
    [applicationId]
  );
  if (placement) throw new AppError('This sourcing record is linked to a placement and cannot be deleted.', 409);
  const [result] = await pool.query(
    'DELETE FROM candidate_applications WHERE id = ? AND candidate_id = ?',
    [applicationId, candidateId]
  );
  if (!result.affectedRows) throw new AppError('Candidate sourcing record not found.', 404);
  res.json({ success: true, message: 'Candidate sourcing record deleted.' });
});

export const getCandidateHistory = asyncHandler(async (req, res) => {
  const candidateId = positiveId(req.params.id, 'candidate ID');
  const [rows] = await pool.query(
    `SELECT h.id, h.candidate_id, h.client_id, h.application_id, h.opening_id,
       h.company_name_snapshot, h.position, h.location, h.ctc, h.offered_ctc,
       h.gross_salary, h.offer_date, h.joining_date, h.leaving_date,
       h.employment_status, h.placement_fee, h.replacement_period_days,
       h.recruiter_id, h.reason_for_leaving, h.notes, h.created_at, h.updated_at,
       c.company_name, e.full_name AS recorded_by_name,
       recruiter.full_name AS recruiter_name, jo.title AS requirement_title
     FROM candidate_employment_history h
     LEFT JOIN clients c ON c.id = h.client_id
     LEFT JOIN employees e ON e.id = h.recorded_by
     LEFT JOIN employees recruiter ON recruiter.id = h.recruiter_id
     LEFT JOIN job_openings jo ON jo.id = h.opening_id
     WHERE h.candidate_id = ?
     ORDER BY COALESCE(h.joining_date, h.offer_date, '1000-01-01') DESC, h.id DESC`,
    [candidateId]
  );
  res.json({ success: true, data: rows });
});

async function validateHistoryPayload(connection, candidateId, body) {
  let applicationId = optionalId(body.applicationId, 'sourcing record');
  let clientId = optionalId(body.clientId, 'company');
  let openingId = optionalId(body.openingId, 'job requirement');
  let companyName = '';

  if (applicationId) {
    const [[application]] = await connection.query(
      `SELECT ca.id, ca.candidate_id, ca.opening_id, jo.client_id, c.company_name
       FROM candidate_applications ca
       JOIN job_openings jo ON jo.id = ca.opening_id
       JOIN clients c ON c.id = jo.client_id
       WHERE ca.id = ?`,
      [applicationId]
    );
    if (!application || Number(application.candidate_id) !== Number(candidateId)) {
      throw new AppError('Selected sourcing record does not belong to this candidate.', 400);
    }
    clientId = application.client_id;
    openingId = application.opening_id;
    companyName = application.company_name;
  } else {
    if (!clientId) throw new AppError('Placed company is required.', 400);
    const [[client]] = await connection.query('SELECT id, company_name FROM clients WHERE id = ?', [clientId]);
    if (!client) throw new AppError('Company not found.', 404);
    companyName = client.company_name;
  }

  const position = String(body.position || '').trim();
  if (!position) throw new AppError('Placement designation is required.', 400);
  const status = body.employmentStatus || 'JOINED';
  if (!allowedEmploymentStatuses.includes(status)) throw new AppError('Invalid employment status.', 400);
  const joiningDate = isoDateOrNull(body.joiningDate, 'joining date');
  const leavingDate = isoDateOrNull(body.leavingDate, 'leaving date');
  if (joiningDate && leavingDate && leavingDate < joiningDate) {
    throw new AppError('Leaving date cannot be earlier than joining date.', 400);
  }

  return {
    applicationId,
    clientId,
    openingId,
    companyName,
    position,
    location: String(body.location || '').trim() || null,
    ctc: asNumber(body.ctc) || 0,
    offeredCtc: asNumber(body.offeredCtc) || asNumber(body.ctc) || 0,
    grossSalary: asNumber(body.grossSalary) || 0,
    offerDate: isoDateOrNull(body.offerDate, 'offer date'),
    joiningDate,
    leavingDate,
    status,
    placementFee: asNumber(body.placementFee) || 0,
    replacementPeriodDays: asNumber(body.replacementPeriodDays),
    recruiterId: optionalId(body.recruiterId, 'recruiter') || null,
    reasonForLeaving: String(body.reasonForLeaving || '').trim() || null,
    notes: String(body.notes || '').trim() || null
  };
}

export const createCandidateHistory = asyncHandler(async (req, res) => {
  const candidateId = positiveId(req.params.id, 'candidate ID');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[candidate]] = await connection.query('SELECT id FROM candidates WHERE id = ?', [candidateId]);
    if (!candidate) throw new AppError('Candidate not found.', 404);
    const data = await validateHistoryPayload(connection, candidateId, req.body);
    const [result] = await connection.query(
      `INSERT INTO candidate_employment_history (
         candidate_id, client_id, application_id, opening_id, company_name_snapshot,
         position, location, ctc, offered_ctc, gross_salary, offer_date, joining_date,
         leaving_date, employment_status, placement_fee, replacement_period_days,
         recruiter_id, reason_for_leaving, notes, recorded_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [candidateId, data.clientId, data.applicationId, data.openingId, data.companyName,
        data.position, data.location, data.ctc, data.offeredCtc, data.grossSalary,
        data.offerDate, data.joiningDate, data.leavingDate, data.status,
        data.placementFee, data.replacementPeriodDays, data.recruiterId || req.user.id,
        data.reasonForLeaving, data.notes, req.user.id]
    );
    if (data.applicationId && ['JOINED','ACTIVE'].includes(data.status)) {
      await connection.query(
        `UPDATE candidate_applications SET stage = 'JOINED', last_updated = CURRENT_TIMESTAMP WHERE id = ?`,
        [data.applicationId]
      );
    }
    await connection.commit();
    res.status(201).json({ success: true, message: 'Candidate placement history added.', data: { id: result.insertId } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const updateCandidateHistory = asyncHandler(async (req, res) => {
  const candidateId = positiveId(req.params.id, 'candidate ID');
  const historyId = positiveId(req.params.historyId, 'history ID');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const data = await validateHistoryPayload(connection, candidateId, req.body);
    const [result] = await connection.query(
      `UPDATE candidate_employment_history SET client_id = ?, application_id = ?, opening_id = ?,
       company_name_snapshot = ?, position = ?, location = ?, ctc = ?, offered_ctc = ?,
       gross_salary = ?, offer_date = ?, joining_date = ?, leaving_date = ?,
       employment_status = ?, placement_fee = ?, replacement_period_days = ?, recruiter_id = ?,
       reason_for_leaving = ?, notes = ? WHERE id = ? AND candidate_id = ?`,
      [data.clientId, data.applicationId, data.openingId, data.companyName, data.position,
        data.location, data.ctc, data.offeredCtc, data.grossSalary, data.offerDate,
        data.joiningDate, data.leavingDate, data.status, data.placementFee,
        data.replacementPeriodDays, data.recruiterId || req.user.id,
        data.reasonForLeaving, data.notes, historyId, candidateId]
    );
    if (!result.affectedRows) throw new AppError('Candidate history record not found.', 404);
    if (data.applicationId && ['JOINED','ACTIVE'].includes(data.status)) {
      await connection.query(`UPDATE candidate_applications SET stage = 'JOINED' WHERE id = ?`, [data.applicationId]);
    }
    await connection.commit();
    res.json({ success: true, message: 'Candidate placement history updated.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const deleteCandidateHistory = asyncHandler(async (req, res) => {
  const candidateId = positiveId(req.params.id, 'candidate ID');
  const historyId = positiveId(req.params.historyId, 'history ID');
  const [[invoiceItem]] = await pool.query(
    'SELECT id FROM invoice_items WHERE placement_history_id = ? LIMIT 1',
    [historyId]
  );
  if (invoiceItem) throw new AppError('This placement is already used in an invoice and cannot be deleted.', 409);
  const [result] = await pool.query(
    'DELETE FROM candidate_employment_history WHERE id = ? AND candidate_id = ?',
    [historyId, candidateId]
  );
  if (!result.affectedRows) throw new AppError('Candidate history record not found.', 404);
  res.json({ success: true, message: 'Candidate placement history deleted.' });
});

