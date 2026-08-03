import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const allowedStages = [
  'SOURCED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFERED',
  'JOINED',
  'REJECTED',
  'WITHDRAWN'
];
async function notifyRecruitmentTeam({
  actorId,
  type,
  title,
  message,
  referenceId
}) {
  const [recipients] = await pool.query(
    `SELECT id
     FROM employees
     WHERE role IN (
       'SUPER_ADMIN',
       'ADMIN',
       'HR',
       'MANAGER'
     )
       AND status = 'ACTIVE'
       AND id <> ?`,
    [actorId]
  );

  if (!recipients.length) {
    return;
  }

  const placeholders = recipients
    .map(() => `(?, ?, ?, ?, ?, 'CANDIDATE_APPLICATION', ?)`)
    .join(', ');

  const values = [];

  for (const recipient of recipients) {
    values.push(
      recipient.id,
      actorId,
      type,
      title,
      message,
      referenceId || null
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

export const listCandidates = asyncHandler(async (req, res) => {
  const {
    search,
    stage,
    openingId,
    assignedRecruiterId
  } = req.query;

  const conditions = [];
  const values = [];

  if (stage && stage !== 'ALL') {
    if (!allowedStages.includes(stage)) {
      throw new AppError('Invalid candidate stage.', 400);
    }

    conditions.push('application.stage = ?');
    values.push(stage);
  }

  if (openingId) {
    const parsedOpeningId = Number(openingId);

    if (!Number.isInteger(parsedOpeningId) || parsedOpeningId <= 0) {
      throw new AppError('Invalid opening filter.', 400);
    }

    conditions.push('application.opening_id = ?');
    values.push(parsedOpeningId);
  }

  if (assignedRecruiterId) {
    const parsedRecruiterId = Number(assignedRecruiterId);

    if (!Number.isInteger(parsedRecruiterId) || parsedRecruiterId <= 0) {
      throw new AppError('Invalid employee filter.', 400);
    }

    conditions.push('application.assigned_recruiter_id = ?');
    values.push(parsedRecruiterId);
  }

  const keyword = String(search || '').trim();

  if (keyword) {
    conditions.push(
      `LOWER(CONCAT_WS(
         ' ',
         candidate.full_name,
         candidate.email,
         candidate.phone,
         candidate.current_location,
         candidate.preferred_location,
         candidate.skills,
         application.stage,
         opening.title,
         client.company_name,
         recruiter.full_name,
         recruiter.employee_id
       )) LIKE ?`
    );
    values.push(`%${keyword.toLowerCase()}%`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const [rows] = await pool.query(
    `SELECT
       candidate.id,
       candidate.full_name,
       candidate.email,
       candidate.phone,
       candidate.current_location,
       candidate.preferred_location,
       candidate.total_experience,
       candidate.current_ctc,
       candidate.expected_ctc,
       candidate.notice_period_days,
       candidate.skills,
       candidate.created_at,

       creator.id AS added_by_id,
       creator.full_name AS added_by_name,

       application.id AS application_id,
       application.stage,
       application.assigned_recruiter_id,
       application.last_updated,

       opening.id AS opening_id,
       opening.title AS job_role,
       opening.status AS opening_status,
       opening.closed_date,

       client.id AS client_id,
       client.company_name,

       recruiter.full_name AS assigned_recruiter_name,
       closer.full_name AS position_closed_by_name

     FROM candidates candidate

     LEFT JOIN employees creator
       ON creator.id = candidate.created_by

     LEFT JOIN candidate_applications application
       ON application.candidate_id = candidate.id

     LEFT JOIN job_openings opening
       ON opening.id = application.opening_id

     LEFT JOIN clients client
       ON client.id = opening.client_id

     LEFT JOIN employees recruiter
       ON recruiter.id = application.assigned_recruiter_id

     LEFT JOIN employees closer
       ON closer.id = opening.closed_by

     ${whereClause}
     ORDER BY candidate.created_at DESC,
              application.last_updated DESC
     LIMIT 1000`,
    values
  );

  res.json({
    success: true,
    data: rows,
    meta: {
      count: rows.length,
      search: keyword || null,
      stage: stage || 'ALL',
      openingId: openingId || null,
      assignedRecruiterId: assignedRecruiterId || null
    }
  });
});

export const createCandidate = asyncHandler(async (req, res) => {
  const {
    fullName,
    email,
    phone,
    currentLocation,
    preferredLocation,
    totalExperience,
    currentCtc,
    expectedCtc,
    noticePeriodDays,
    skills,
    openingId,
    stage
  } = req.body;

  if (!fullName?.trim()) {
    throw new AppError('Candidate name is required.', 400);
  }

  if (!phone?.trim() && !email?.trim()) {
    throw new AppError(
      'Candidate phone number or email is required.',
      400
    );
  }

  const finalStage = stage || 'SOURCED';

  if (!allowedStages.includes(finalStage)) {
    throw new AppError('Invalid candidate stage.', 400);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let candidateId;

    if (email?.trim()) {
      const [[existingCandidate]] = await connection.query(
        `SELECT id
         FROM candidates
         WHERE email = ?
         LIMIT 1`,
        [email.trim()]
      );

      candidateId = existingCandidate?.id;
    }

    if (!candidateId && phone?.trim()) {
      const [[existingCandidate]] = await connection.query(
        `SELECT id
         FROM candidates
         WHERE phone = ?
         LIMIT 1`,
        [phone.trim()]
      );

      candidateId = existingCandidate?.id;
    }

    if (!candidateId) {
      const [candidateResult] = await connection.query(
        `INSERT INTO candidates
         (
           full_name,
           email,
           phone,
           current_location,
           preferred_location,
           total_experience,
           current_ctc,
           expected_ctc,
           notice_period_days,
           skills,
           created_by
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fullName.trim(),
          email?.trim() || null,
          phone?.trim() || null,
          currentLocation?.trim() || null,
          preferredLocation?.trim() || null,
          totalExperience || null,
          currentCtc || null,
          expectedCtc || null,
          noticePeriodDays || null,
          skills?.trim() || null,
          req.user.id
        ]
      );

      candidateId = candidateResult.insertId;
    }

    if (openingId) {
      const [[opening]] = await connection.query(
        `SELECT id, status
         FROM job_openings
         WHERE id = ?`,
        [openingId]
      );

      if (!opening) {
        throw new AppError('Job opening not found.', 404);
      }

      if (opening.status === 'CLOSED') {
        throw new AppError(
          'Candidate cannot be added to a closed opening.',
          409
        );
      }

      const [[existingApplication]] = await connection.query(
        `SELECT id
         FROM candidate_applications
         WHERE candidate_id = ?
           AND opening_id = ?
         LIMIT 1`,
        [candidateId, openingId]
      );

      if (existingApplication) {
        throw new AppError(
          'This candidate is already added to the selected opening.',
          409
        );
      }

      await connection.query(
        `INSERT INTO candidate_applications
         (
           candidate_id,
           opening_id,
           stage,
           assigned_recruiter_id
         )
         VALUES (?, ?, ?, ?)`,
        [
          candidateId,
          openingId,
          finalStage,
          req.user.id
        ]
      );
    }

    await connection.commit();

await notifyRecruitmentTeam({
  actorId: req.user.id,
  type: openingId
    ? 'CANDIDATE_LINKED'
    : 'CANDIDATE_ADDED',
  title: openingId
    ? 'Candidate Added to Opening'
    : 'New Candidate Added',
  message: openingId
    ? `${fullName.trim()} was added to a job opening at stage ${finalStage.replaceAll(
        '_',
        ' '
      )}.`
    : `${fullName.trim()} was added to the candidate database.`,
  referenceId: candidateId
});

    res.status(201).json({
      success: true,
      message: openingId
        ? 'Candidate added and linked to the job opening.'
        : 'Candidate added successfully.',
      data: {
        id: candidateId
      }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const updateCandidateStage = asyncHandler(
  async (req, res) => {
    const applicationId = Number(req.params.applicationId);
    const { stage } = req.body;

    if (
      !Number.isInteger(applicationId) ||
      applicationId <= 0
    ) {
      throw new AppError(
        'Invalid candidate application ID.',
        400
      );
    }

    if (!allowedStages.includes(stage)) {
      throw new AppError('Invalid candidate stage.', 400);
    }

    const [[application]] = await pool.query(
      `SELECT
   ca.id,
   ca.opening_id,
   ca.stage AS current_stage,
   jo.status AS opening_status,
   jo.title AS job_role,
   candidate.full_name AS candidate_name,
   client.company_name
 FROM candidate_applications ca
 JOIN candidates candidate
   ON candidate.id = ca.candidate_id
 JOIN job_openings jo
   ON jo.id = ca.opening_id
 JOIN clients client
   ON client.id = jo.client_id
WHERE ca.id = ?`,
  [applicationId]
);

    if (!application) {
      throw new AppError(
        'Candidate application not found.',
        404
      );
    }

    if (application.opening_status === 'CLOSED') {
      throw new AppError(
        'A candidate stage cannot be changed after the position is closed.',
        409
      );
    }

    await pool.query(
      `UPDATE candidate_applications
       SET
         stage = ?,
         assigned_recruiter_id = ?,
         last_updated = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        stage,
        req.user.id,
        applicationId
      ]
    );
await notifyRecruitmentTeam({
  actorId: req.user.id,
  type: 'CANDIDATE_STAGE_UPDATED',
  title:
    stage === 'JOINED'
      ? 'Candidate Joined'
      : stage === 'OFFERED'
        ? 'Candidate Offered'
        : stage === 'INTERVIEW'
          ? 'Candidate Moved to Interview'
          : 'Candidate Stage Updated',
  message: `${application.candidate_name} for ${application.job_role} at ${application.company_name} moved from ${application.current_stage.replaceAll(
    '_',
    ' '
  )} to ${stage.replaceAll('_', ' ')}.`,
  referenceId: applicationId
});

    res.json({
      success: true,
      message: 'Candidate stage updated successfully.'
    });
  }
);