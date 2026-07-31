import bcrypt from 'bcryptjs';
import { pool } from './config/database.js';

const DEMO_PASSWORD = 'Demo@123';

async function getDepartmentId(connection, name) {
  const [rows] = await connection.query(
    'SELECT id FROM departments WHERE name = ? LIMIT 1',
    [name]
  );

  return rows[0]?.id || null;
}

async function getEmployeeId(connection, employeeCode) {
  const [rows] = await connection.query(
    'SELECT id FROM employees WHERE employee_id = ? LIMIT 1',
    [employeeCode]
  );

  return rows[0]?.id || null;
}

async function createDemoEmployee(connection, employee) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await connection.query(
    `
      INSERT INTO employees (
        employee_id,
        full_name,
        email,
        personal_email,
        phone,
        alternate_phone,
        password_hash,
        role,
        designation,
        department_id,
        joining_date,
        employment_type,
        work_location,
        date_of_birth,
        gender,
        blood_group,
        marital_status,
        status,
        must_change_password
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', FALSE)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        email = VALUES(email),
        personal_email = VALUES(personal_email),
        phone = VALUES(phone),
        alternate_phone = VALUES(alternate_phone),
        role = VALUES(role),
        designation = VALUES(designation),
        department_id = VALUES(department_id),
        joining_date = VALUES(joining_date),
        employment_type = VALUES(employment_type),
        work_location = VALUES(work_location),
        date_of_birth = VALUES(date_of_birth),
        gender = VALUES(gender),
        blood_group = VALUES(blood_group),
        marital_status = VALUES(marital_status),
        status = 'ACTIVE'
    `,
    [
      employee.employeeId,
      employee.fullName,
      employee.officialEmail,
      employee.personalEmail,
      employee.phone,
      employee.alternatePhone,
      passwordHash,
      employee.role,
      employee.designation,
      employee.departmentId,
      employee.joiningDate,
      employee.employmentType,
      employee.workLocation,
      employee.dateOfBirth,
      employee.gender,
      employee.bloodGroup,
      employee.maritalStatus
    ]
  );

  return getEmployeeId(connection, employee.employeeId);
}

async function saveAddress(connection, employeeId, addressType, address) {
  await connection.query(
    `
      INSERT INTO employee_addresses (
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
        country = VALUES(country)
    `,
    [
      employeeId,
      addressType,
      address.line1,
      address.line2,
      address.city,
      address.state,
      address.postalCode,
      address.country
    ]
  );
}

async function saveEmergencyContact(connection, employeeId, contact) {
  const [existing] = await connection.query(
    `
      SELECT id
      FROM employee_emergency_contacts
      WHERE employee_id = ?
      LIMIT 1
    `,
    [employeeId]
  );

  if (existing.length) {
    await connection.query(
      `
        UPDATE employee_emergency_contacts
        SET contact_name = ?,
            relationship = ?,
            phone = ?,
            alternate_phone = ?
        WHERE id = ?
      `,
      [
        contact.name,
        contact.relationship,
        contact.phone,
        contact.alternatePhone,
        existing[0].id
      ]
    );
  } else {
    await connection.query(
      `
        INSERT INTO employee_emergency_contacts (
          employee_id,
          contact_name,
          relationship,
          phone,
          alternate_phone
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        employeeId,
        contact.name,
        contact.relationship,
        contact.phone,
        contact.alternatePhone
      ]
    );
  }
}

async function saveBankDetails(connection, employeeId, bank) {
  await connection.query(
    `
      INSERT INTO employee_bank_details (
        employee_id,
        account_holder_name,
        bank_name,
        account_number,
        ifsc_code,
        branch_name,
        pan_number,
        uan_number,
        pf_number,
        esi_number
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        account_holder_name = VALUES(account_holder_name),
        bank_name = VALUES(bank_name),
        account_number = VALUES(account_number),
        ifsc_code = VALUES(ifsc_code),
        branch_name = VALUES(branch_name),
        pan_number = VALUES(pan_number),
        uan_number = VALUES(uan_number),
        pf_number = VALUES(pf_number),
        esi_number = VALUES(esi_number)
    `,
    [
      employeeId,
      bank.accountHolderName,
      bank.bankName,
      bank.accountNumber,
      bank.ifscCode,
      bank.branchName,
      bank.panNumber,
      bank.uanNumber,
      bank.pfNumber,
      bank.esiNumber
    ]
  );
}

async function seedDemoData() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const managementId = await getDepartmentId(connection, 'Management');
    const hrId = await getDepartmentId(connection, 'Human Resources');
    const recruitmentId = await getDepartmentId(connection, 'Recruitment');
    const marketingId = await getDepartmentId(connection, 'Marketing');

    const demoEmployees = [
      {
        employeeId: 'SRSB002',
        fullName: 'Ananya Sharma',
        officialEmail: 'ananya.sharma@srsb.demo',
        personalEmail: 'ananya.personal@example.com',
        phone: '9000000002',
        alternatePhone: '9100000002',
        role: 'HR',
        designation: 'HR Manager',
        departmentId: hrId,
        joiningDate: '2025-02-10',
        employmentType: 'PERMANENT',
        workLocation: 'Rajajinagar, Bengaluru',
        dateOfBirth: '1993-08-14',
        gender: 'FEMALE',
        bloodGroup: 'B+',
        maritalStatus: 'MARRIED'
      },
      {
        employeeId: 'SRSB003',
        fullName: 'Rohan Mehta',
        officialEmail: 'rohan.mehta@srsb.demo',
        personalEmail: 'rohan.personal@example.com',
        phone: '9000000003',
        alternatePhone: '9100000003',
        role: 'MANAGER',
        designation: 'Recruitment Manager',
        departmentId: recruitmentId,
        joiningDate: '2025-03-15',
        employmentType: 'PERMANENT',
        workLocation: 'Rajajinagar, Bengaluru',
        dateOfBirth: '1991-04-22',
        gender: 'MALE',
        bloodGroup: 'O+',
        maritalStatus: 'MARRIED'
      },
      {
        employeeId: 'SRSB004',
        fullName: 'Neha Verma',
        officialEmail: 'neha.verma@srsb.demo',
        personalEmail: 'neha.personal@example.com',
        phone: '9000000004',
        alternatePhone: '9100000004',
        role: 'RECRUITER',
        designation: 'Senior Recruiter',
        departmentId: recruitmentId,
        joiningDate: '2025-05-20',
        employmentType: 'PERMANENT',
        workLocation: 'Rajajinagar, Bengaluru',
        dateOfBirth: '1996-11-05',
        gender: 'FEMALE',
        bloodGroup: 'A+',
        maritalStatus: 'SINGLE'
      },
      {
        employeeId: 'SRSB005',
        fullName: 'Priya Nayak',
        officialEmail: 'priya.nayak@srsb.demo',
        personalEmail: 'priya.personal@example.com',
        phone: '9000000005',
        alternatePhone: '9100000005',
        role: 'EMPLOYEE',
        designation: 'Digital Marketing Executive',
        departmentId: marketingId,
        joiningDate: '2026-06-26',
        employmentType: 'PERMANENT',
        workLocation: 'Rajajinagar, Bengaluru',
        dateOfBirth: '2000-01-15',
        gender: 'FEMALE',
        bloodGroup: 'O+',
        maritalStatus: 'SINGLE'
      },
      {
        employeeId: 'SRSB006',
        fullName: 'Arjun Rao',
        officialEmail: 'arjun.rao@srsb.demo',
        personalEmail: 'arjun.personal@example.com',
        phone: '9000000006',
        alternatePhone: '9100000006',
        role: 'EMPLOYEE',
        designation: 'Operations Executive',
        departmentId: managementId,
        joiningDate: '2026-01-12',
        employmentType: 'CONTRACT',
        workLocation: 'Rajajinagar, Bengaluru',
        dateOfBirth: '1997-06-18',
        gender: 'MALE',
        bloodGroup: 'AB+',
        maritalStatus: 'SINGLE'
      }
    ];

    const createdEmployees = {};

    for (const employee of demoEmployees) {
      const databaseId = await createDemoEmployee(connection, employee);
      createdEmployees[employee.employeeId] = databaseId;

      await saveAddress(connection, databaseId, 'CURRENT', {
        line1: 'Demo Residence, 3rd Block',
        line2: 'Near Metro Station',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560010',
        country: 'India'
      });

      await saveAddress(connection, databaseId, 'PERMANENT', {
        line1: 'Demo Permanent Address',
        line2: 'Main Road',
        city: employee.employeeId === 'SRSB005' ? 'Balasore' : 'Bengaluru',
        state: employee.employeeId === 'SRSB005' ? 'Odisha' : 'Karnataka',
        postalCode: employee.employeeId === 'SRSB005' ? '756001' : '560001',
        country: 'India'
      });

      await saveEmergencyContact(connection, databaseId, {
        name: `Emergency Contact ${employee.employeeId}`,
        relationship: 'Family',
        phone: `8000000${employee.employeeId.slice(-3)}`,
        alternatePhone: null
      });

      await saveBankDetails(connection, databaseId, {
        accountHolderName: employee.fullName,
        bankName: 'Demo Bank',
        accountNumber: `000000${employee.employeeId.slice(-3)}01`,
        ifscCode: 'DEMO0001234',
        branchName: 'Rajajinagar Demo Branch',
        panNumber: `ABCDE${employee.employeeId.slice(-3)}F`,
        uanNumber: `100000000${employee.employeeId.slice(-3)}`,
        pfNumber: `PF-SRSB-${employee.employeeId.slice(-3)}`,
        esiNumber: `ESI-SRSB-${employee.employeeId.slice(-3)}`
      });
    }

    const adminId = await getEmployeeId(connection, 'SRSB001');
    const hrManagerId = createdEmployees.SRSB002;
    const recruitmentManagerId = createdEmployees.SRSB003;
    const recruiterId = createdEmployees.SRSB004;
    const marketingEmployeeId = createdEmployees.SRSB005;
    const operationsEmployeeId = createdEmployees.SRSB006;

    await connection.query(
      `
        UPDATE employees
        SET department_id = ?,
            designation = 'Super Administrator',
            work_location = 'Rajajinagar, Bengaluru',
            employment_type = 'PERMANENT'
        WHERE employee_id = 'SRSB001'
      `,
      [managementId]
    );

    await connection.query(
      `
        UPDATE employees
        SET manager_id = ?
        WHERE employee_id IN ('SRSB004')
      `,
      [recruitmentManagerId]
    );

    await connection.query(
      `
        UPDATE employees
        SET manager_id = ?
        WHERE employee_id IN ('SRSB005', 'SRSB006')
      `,
      [adminId]
    );

    await connection.query(
      `
        INSERT INTO clients (
          company_name,
          industry,
          website,
          contact_name,
          contact_email,
          contact_phone,
          onboarded_by,
          status
        )
        VALUES
          (
            'Demo Infotech Private Limited',
            'Information Technology',
            'https://example.com',
            'Kavya Menon',
            'kavya@example.com',
            '7000000001',
            ?,
            'ACTIVE'
          ),
          (
            'Demo Manufacturing Industries',
            'Manufacturing',
            'https://example.org',
            'Amit Kulkarni',
            'amit@example.org',
            '7000000002',
            ?,
            'ACTIVE'
          )
        ON DUPLICATE KEY UPDATE
          company_name = VALUES(company_name)
      `,
      [marketingEmployeeId, adminId]
    );

    const [clientRows] = await connection.query(
      `
        SELECT id, company_name
        FROM clients
        WHERE company_name IN (
          'Demo Infotech Private Limited',
          'Demo Manufacturing Industries'
        )
      `
    );

    const clientMap = {};
    for (const client of clientRows) {
      clientMap[client.company_name] = client.id;
    }

    const [existingOpening] = await connection.query(
      `
        SELECT id
        FROM job_openings
        WHERE client_id = ?
          AND title = 'GIS Developer'
        LIMIT 1
      `,
      [clientMap['Demo Infotech Private Limited']]
    );

    let gisOpeningId;

    if (existingOpening.length) {
      gisOpeningId = existingOpening[0].id;
    } else {
      const [openingResult] = await connection.query(
        `
          INSERT INTO job_openings (
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
          VALUES (?, 'GIS Developer', 'Bengaluru', 3, 2, 5, ?, 'HIGH', 'SOURCING',
                  DATE_SUB(CURDATE(), INTERVAL 10 DAY),
                  DATE_ADD(CURDATE(), INTERVAL 20 DAY))
        `,
        [
          clientMap['Demo Infotech Private Limited'],
          recruiterId
        ]
      );

      gisOpeningId = openingResult.insertId;
    }

    const [existingSupportOpening] = await connection.query(
      `
        SELECT id
        FROM job_openings
        WHERE client_id = ?
          AND title = 'Application Support Engineer'
        LIMIT 1
      `,
      [clientMap['Demo Manufacturing Industries']]
    );

    let supportOpeningId;

    if (existingSupportOpening.length) {
      supportOpeningId = existingSupportOpening[0].id;
    } else {
      const [openingResult] = await connection.query(
        `
          INSERT INTO job_openings (
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
          VALUES (?, 'Application Support Engineer', 'Bengaluru', 2, 2, 4, ?,
                  'MEDIUM', 'SCREENING',
                  DATE_SUB(CURDATE(), INTERVAL 15 DAY),
                  DATE_ADD(CURDATE(), INTERVAL 15 DAY))
        `,
        [
          clientMap['Demo Manufacturing Industries'],
          recruiterId
        ]
      );

      supportOpeningId = openingResult.insertId;
    }

    const candidates = [
      {
        fullName: 'Rahul Kumar',
        email: 'rahul.candidate@example.com',
        phone: '6000000001',
        skills: 'GIS, ArcGIS, QGIS, SQL',
        openingId: gisOpeningId,
        stage: 'SHORTLISTED'
      },
      {
        fullName: 'Sneha Das',
        email: 'sneha.candidate@example.com',
        phone: '6000000002',
        skills: 'Java, SQL, Linux, Application Support',
        openingId: supportOpeningId,
        stage: 'INTERVIEW'
      },
      {
        fullName: 'Vikram Singh',
        email: 'vikram.candidate@example.com',
        phone: '6000000003',
        skills: 'GIS, Python, PostGIS',
        openingId: gisOpeningId,
        stage: 'SCREENING'
      }
    ];

    for (const candidate of candidates) {
      const [existingCandidate] = await connection.query(
        'SELECT id FROM candidates WHERE email = ? LIMIT 1',
        [candidate.email]
      );

      let candidateId;

      if (existingCandidate.length) {
        candidateId = existingCandidate[0].id;
      } else {
        const [candidateResult] = await connection.query(
          `
            INSERT INTO candidates (
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
            VALUES (?, ?, ?, 'Bengaluru', 'Bengaluru', 3, 450000, 600000, 30, ?, ?)
          `,
          [
            candidate.fullName,
            candidate.email,
            candidate.phone,
            candidate.skills,
            recruiterId
          ]
        );

        candidateId = candidateResult.insertId;
      }

      await connection.query(
        `
          INSERT INTO candidate_applications (
            candidate_id,
            opening_id,
            stage,
            assigned_recruiter_id
          )
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            stage = VALUES(stage),
            assigned_recruiter_id = VALUES(assigned_recruiter_id)
        `,
        [
          candidateId,
          candidate.openingId,
          candidate.stage,
          recruiterId
        ]
      );
    }

    const demoTasks = [
      {
        title: 'Prepare weekly recruitment report',
        description: 'Prepare client-wise recruitment progress and candidate-stage report.',
        assignedTo: recruiterId,
        assignedBy: recruitmentManagerId,
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        progress: 45,
        dueDays: 3
      },
      {
        title: 'Prepare July social media calendar',
        description: 'Create LinkedIn and Instagram content ideas for the remaining month.',
        assignedTo: marketingEmployeeId,
        assignedBy: adminId,
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
        progress: 60,
        dueDays: 5
      },
      {
        title: 'Verify employee profile records',
        description: 'Check personal details, addresses and emergency contact information.',
        assignedTo: hrManagerId,
        assignedBy: adminId,
        priority: 'HIGH',
        status: 'TODO',
        progress: 0,
        dueDays: 7
      },
      {
        title: 'Update office asset register',
        description: 'Update the list of systems and office assets assigned to employees.',
        assignedTo: operationsEmployeeId,
        assignedBy: adminId,
        priority: 'LOW',
        status: 'TODO',
        progress: 0,
        dueDays: 10
      }
    ];

    for (const task of demoTasks) {
      const [existingTask] = await connection.query(
        `
          SELECT id
          FROM tasks
          WHERE title = ?
            AND assigned_to = ?
          LIMIT 1
        `,
        [task.title, task.assignedTo]
      );

      if (!existingTask.length) {
        await connection.query(
          `
            INSERT INTO tasks (
              title,
              description,
              assigned_to,
              assigned_by,
              due_date,
              priority,
              status,
              progress
            )
            VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?, ?, ?)
          `,
          [
            task.title,
            task.description,
            task.assignedTo,
            task.assignedBy,
            task.dueDays,
            task.priority,
            task.status,
            task.progress
          ]
        );
      }
    }

    const attendanceEmployees = [
      hrManagerId,
      recruitmentManagerId,
      recruiterId,
      marketingEmployeeId,
      operationsEmployeeId
    ];

    for (let daysAgo = 1; daysAgo <= 10; daysAgo += 1) {
      for (let index = 0; index < attendanceEmployees.length; index += 1) {
        const employeeId = attendanceEmployees[index];

        if (daysAgo === 3 && employeeId === marketingEmployeeId) {
          await connection.query(
            `
              INSERT INTO attendance (
                employee_id,
                attendance_date,
                status,
                remarks
              )
              VALUES (?, DATE_SUB(CURDATE(), INTERVAL ? DAY), 'LEAVE', 'Approved casual leave')
              ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                remarks = VALUES(remarks)
            `,
            [employeeId, daysAgo]
          );

          continue;
        }

        if (daysAgo === 5 && employeeId === operationsEmployeeId) {
          await connection.query(
            `
              INSERT INTO attendance (
                employee_id,
                attendance_date,
                status,
                remarks
              )
              VALUES (?, DATE_SUB(CURDATE(), INTERVAL ? DAY), 'ABSENT', 'Demo absence')
              ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                remarks = VALUES(remarks)
            `,
            [employeeId, daysAgo]
          );

          continue;
        }

        await connection.query(
          `
            INSERT INTO attendance (
              employee_id,
              attendance_date,
              punch_in,
              punch_out,
              total_work_minutes,
              status,
              remarks
            )
            VALUES (
              ?,
              DATE_SUB(CURDATE(), INTERVAL ? DAY),
              TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL ? DAY), '09:35:00'),
              TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL ? DAY), '18:25:00'),
              530,
              'PRESENT',
              'Demo attendance'
            )
            ON DUPLICATE KEY UPDATE
              punch_in = VALUES(punch_in),
              punch_out = VALUES(punch_out),
              total_work_minutes = VALUES(total_work_minutes),
              status = VALUES(status),
              remarks = VALUES(remarks)
          `,
          [employeeId, daysAgo, daysAgo, daysAgo]
        );
      }
    }

    const [existingLeave] = await connection.query(
      `
        SELECT id
        FROM leave_requests
        WHERE employee_id = ?
          AND reason = 'Demo personal leave request'
        LIMIT 1
      `,
      [marketingEmployeeId]
    );

    if (!existingLeave.length) {
      await connection.query(
        `
          INSERT INTO leave_requests (
            employee_id,
            leave_type,
            start_date,
            end_date,
            duration_type,
            reason,
            status,
            reviewed_by,
            reviewer_comment,
            reviewed_at
          )
          VALUES (
            ?,
            'CASUAL',
            DATE_ADD(CURDATE(), INTERVAL 5 DAY),
            DATE_ADD(CURDATE(), INTERVAL 6 DAY),
            'FULL_DAY',
            'Demo personal leave request',
            'APPROVED',
            ?,
            'Approved for testing',
            NOW()
          )
        `,
        [marketingEmployeeId, hrManagerId]
      );
    }

    const [pendingLeave] = await connection.query(
      `
        SELECT id
        FROM leave_requests
        WHERE employee_id = ?
          AND reason = 'Demo medical appointment'
        LIMIT 1
      `,
      [recruiterId]
    );

    if (!pendingLeave.length) {
      await connection.query(
        `
          INSERT INTO leave_requests (
            employee_id,
            leave_type,
            start_date,
            end_date,
            duration_type,
            reason,
            status
          )
          VALUES (
            ?,
            'SICK',
            DATE_ADD(CURDATE(), INTERVAL 3 DAY),
            DATE_ADD(CURDATE(), INTERVAL 3 DAY),
            'FULL_DAY',
            'Demo medical appointment',
            'PENDING'
          )
        `,
        [recruiterId]
      );
    }

    const [existingInvoice] = await connection.query(
      `
        SELECT id
        FROM invoices
        WHERE invoice_number = 'SRSB-DEMO-001'
        LIMIT 1
      `
    );

    let invoiceId;

    if (existingInvoice.length) {
      invoiceId = existingInvoice[0].id;
    } else {
      const [invoiceResult] = await connection.query(
        `
          INSERT INTO invoices (
            invoice_number,
            client_id,
            opening_id,
            closed_by,
            billing_model,
            subtotal,
            gst_amount,
            total_amount,
            invoice_date,
            due_date,
            status
          )
          VALUES (
            'SRSB-DEMO-001',
            ?,
            ?,
            ?,
            'FIXED',
            50000,
            9000,
            59000,
            CURDATE(),
            DATE_ADD(CURDATE(), INTERVAL 30 DAY),
            'PARTIALLY_PAID'
          )
        `,
        [
          clientMap['Demo Infotech Private Limited'],
          gisOpeningId,
          recruitmentManagerId
        ]
      );

      invoiceId = invoiceResult.insertId;
    }

    const [paymentRows] = await connection.query(
      `
        SELECT id
        FROM invoice_payments
        WHERE invoice_id = ?
          AND reference_number = 'DEMO-PAYMENT-001'
        LIMIT 1
      `,
      [invoiceId]
    );

    if (!paymentRows.length) {
      await connection.query(
        `
          INSERT INTO invoice_payments (
            invoice_id,
            amount,
            payment_date,
            payment_method,
            reference_number
          )
          VALUES (?, 25000, CURDATE(), 'BANK TRANSFER', 'DEMO-PAYMENT-001')
        `,
        [invoiceId]
      );
    }

    const [expenseRows] = await connection.query(
      `
        SELECT id
        FROM expenses
        WHERE description = 'Demo LinkedIn advertising expense'
        LIMIT 1
      `
    );

    if (!expenseRows.length) {
      await connection.query(
        `
          INSERT INTO expenses (
            expense_date,
            category,
            description,
            amount,
            recorded_by
          )
          VALUES
            (
              CURDATE(),
              'ADVERTISING',
              'Demo LinkedIn advertising expense',
              7000,
              ?
            ),
            (
              CURDATE(),
              'SOFTWARE',
              'Demo software subscription',
              3500,
              ?
            )
        `,
        [adminId, adminId]
      );
    }

    await connection.commit();

    console.log('Demo data created successfully.');
    console.log('');
    console.log('Admin account:');
    console.log('Employee ID: SRSB001');
    console.log('Password: Admin@123');
    console.log('');
    console.log('Demo employee accounts:');
    console.log('SRSB002 to SRSB006');
    console.log(`Password: ${DEMO_PASSWORD}`);
  } catch (error) {
    await connection.rollback();
    console.error('Demo seed failed:', error);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

seedDemoData();