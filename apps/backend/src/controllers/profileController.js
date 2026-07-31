import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

export const getMyProfile = asyncHandler(async (req, res) => {
  const employeeId = req.user.id;

  const [[employee]] = await pool.query(
    `SELECT
        e.id,
        e.employee_id,
        e.full_name,
        e.profile_photo,
        e.email,
        e.personal_email,
        e.phone,
        e.alternate_phone,
        e.date_of_birth,
        e.gender,
        e.blood_group,
        e.marital_status,
        e.role,
        e.designation,
        e.joining_date,
        e.employment_type,
        e.work_location,
        e.status,
        d.name AS department
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id = ?`,
    [employeeId]
  );

  if (!employee) {
    throw new AppError('Profile not found.', 404);
  }

  const [addresses] = await pool.query(
    `SELECT
        id,
        address_type,
        address_line_1,
        address_line_2,
        city,
        state,
        postal_code,
        country
     FROM employee_addresses
     WHERE employee_id = ?
     ORDER BY address_type`,
    [employeeId]
  );

  const [emergencyContacts] = await pool.query(
    `SELECT
        id,
        contact_name,
        relationship,
        phone,
        alternate_phone
     FROM employee_emergency_contacts
     WHERE employee_id = ?
     ORDER BY id`,
    [employeeId]
  );

  res.json({
    success: true,
    data: {
      employee,
      addresses,
      emergencyContacts
    }
  });
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const employeeId = req.user.id;

  const {
    fullName,
    personalEmail,
    phone,
    alternatePhone,
    dateOfBirth,
    gender,
    bloodGroup,
    maritalStatus,
    workLocation
  } = req.body;

  const [result] = await pool.query(
    `UPDATE employees
     SET
       full_name = ?,
       personal_email = ?,
       phone = ?,
       alternate_phone = ?,
       date_of_birth = ?,
       gender = ?,
       blood_group = ?,
       marital_status = ?,
       work_location = ?
     WHERE id = ?`,
    [
      fullName?.trim() || null,
      personalEmail?.trim() || null,
      phone?.trim() || null,
      alternatePhone?.trim() || null,
      dateOfBirth || null,
      gender || null,
      bloodGroup?.trim() || null,
      maritalStatus || null,
      workLocation?.trim() || null,
      employeeId
    ]
  );

  if (!result.affectedRows) {
    throw new AppError('Profile not found.', 404);
  }

  res.json({
    success: true,
    message: 'Profile updated successfully.'
  });
});

export const saveMyAddress = asyncHandler(async (req, res) => {
  const employeeId = req.user.id;

  const {
    addressType,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country
  } = req.body;

  await pool.query(
    `INSERT INTO employee_addresses
      (
        employee_id,
        address_type,
        address_line_1,
        address_line_2,
        city,
        state,
        postal_code,
        country
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       address_line_1 = VALUES(address_line_1),
       address_line_2 = VALUES(address_line_2),
       city = VALUES(city),
       state = VALUES(state),
       postal_code = VALUES(postal_code),
       country = VALUES(country)`,
    [
      employeeId,
      addressType,
      addressLine1.trim(),
      addressLine2?.trim() || null,
      city.trim(),
      state.trim(),
      postalCode.trim(),
      country?.trim() || 'India'
    ]
  );

  res.json({
    success: true,
    message: 'Address saved successfully.'
  });
});

export const saveMyEmergencyContact = asyncHandler(async (req, res) => {
  const employeeId = req.user.id;

  const {
    contactName,
    relationship,
    phone,
    alternatePhone
  } = req.body;

  const [[existingContact]] = await pool.query(
    `SELECT id
     FROM employee_emergency_contacts
     WHERE employee_id = ?
     ORDER BY id
     LIMIT 1`,
    [employeeId]
  );

  if (existingContact) {
    await pool.query(
      `UPDATE employee_emergency_contacts
       SET
         contact_name = ?,
         relationship = ?,
         phone = ?,
         alternate_phone = ?
       WHERE id = ?`,
      [
        contactName.trim(),
        relationship.trim(),
        phone.trim(),
        alternatePhone?.trim() || null,
        existingContact.id
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO employee_emergency_contacts
        (
          employee_id,
          contact_name,
          relationship,
          phone,
          alternate_phone
        )
       VALUES (?, ?, ?, ?, ?)`,
      [
        employeeId,
        contactName.trim(),
        relationship.trim(),
        phone.trim(),
        alternatePhone?.trim() || null
      ]
    );
  }

  res.json({
    success: true,
    message: 'Emergency contact saved successfully.'
  });
});

export const changeMyPassword = asyncHandler(async (req, res) => {
  const employeeId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  const [[employee]] = await pool.query(
    `SELECT password_hash
     FROM employees
     WHERE id = ?`,
    [employeeId]
  );

  if (!employee) {
    throw new AppError('Account not found.', 404);
  }

  const isValid = await bcrypt.compare(
    currentPassword,
    employee.password_hash
  );

  if (!isValid) {
    throw new AppError('Current password is incorrect.', 400);
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);

 await pool.query(
  `UPDATE employees
   SET
     password_hash = ?,
     must_change_password = 0,
     password_changed_at = CURRENT_TIMESTAMP
   WHERE id = ?`,
  [newPasswordHash, employeeId]
);
  res.json({
    success: true,
    message: 'Password changed successfully.'
  });
});