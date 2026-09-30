import { env } from '../config/env.js';
import { AppError } from './AppError.js';

function buildOtpEmail({
  employeeName,
  otp
}) {
  const subject =
    'SRSB Work Management Password Reset OTP';

  const text = `Hello ${employeeName},

Your password reset OTP is ${otp}.

This OTP will expire in ${env.otpExpiryMinutes} minutes.

Do not share this OTP with anyone.

Regards,
SRSB Workforce Solutions`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin-bottom:8px">Password Reset OTP</h2>
      <p>Hello ${employeeName},</p>
      <p>Your SRSB Work Management OTP is:</p>
      <div style="
        display:inline-block;
        padding:14px 18px;
        margin:8px 0 12px;
        border-radius:10px;
        background:#f1f5f9;
        font-size:28px;
        font-weight:700;
        letter-spacing:6px
      ">
        ${otp}
      </div>
      <p>
        This OTP will expire in
        ${env.otpExpiryMinutes} minutes.
      </p>
      <p>Do not share this OTP with anyone.</p>
      <p>Regards,<br>SRSB Workforce Solutions</p>
    </div>
  `;

  return {
    subject,
    text,
    html
  };
}

async function sendWithResend({
  to,
  subject,
  text,
  html,
  attachments
}) {
  if (
    !env.resendApiKey ||
    !env.resendFromEmail
  ) {
    throw new AppError(
      'Email service is not configured.',
      500
    );
  }

  const response = await fetch(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from:
          `${env.resendFromName} <${env.resendFromEmail}>`,
        to: [to],
        subject,
        text,
        html,
        ...(attachments?.length
          ? {
              attachments: attachments.map((file) => ({
                filename: file.filename,
                content: Buffer.from(file.content).toString('base64')
              }))
            }
          : {})
      })
    }
  );

  if (!response.ok) {
    let details = {};

    try {
      details = await response.json();
    } catch {
      details = {};
    }

    console.error(
      '[email] Resend error:',
      response.status,
      details
    );

    throw new AppError(
      details.message ||
      'OTP email could not be sent.',
      502
    );
  }
}

export async function sendPasswordResetOtp({
  to,
  employeeName,
  otp
}) {
  const email = buildOtpEmail({
    employeeName,
    otp
  });

  await sendWithResend({
    to,
    ...email
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

export async function sendPayslipEmail({
  to,
  employeeName,
  employeeCode,
  companyName,
  periodLabel,
  attachment
}) {
  const company = companyName || 'SRSB Workforce Solutions';
  const portalUrl = env.appBaseUrl ? `${env.appBaseUrl}/#/employee/payslips` : '';

  await sendWithResend({
    to,
    subject: `Your payslip for ${periodLabel} — ${company}`,
    text: `Hello ${employeeName},

Your payslip for ${periodLabel} is attached (${attachment.filename}).
Employee ID: ${employeeCode}
${portalUrl ? `\nYou can also view it any time in the employee portal: ${portalUrl}\n` : ''}
This payslip contains confidential salary information. Please do not forward it.

Regards,
${company}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:560px">
        <h2>Your payslip for ${escapeHtml(periodLabel)}</h2>
        <p>Hello ${escapeHtml(employeeName)},</p>
        <p>Your payslip for <strong>${escapeHtml(periodLabel)}</strong> is attached as
          <strong>${escapeHtml(attachment.filename)}</strong>.</p>
        <p><strong>Employee ID:</strong> ${escapeHtml(employeeCode)}</p>
        ${
          portalUrl
            ? `<p>You can also view it any time in the
                <a href="${escapeHtml(portalUrl)}" style="color:#0f766e">employee portal</a>.</p>`
            : ''
        }
        <p style="font-size:13px;color:#555">This payslip contains confidential salary information. Please do not forward it.</p>
        <p>Regards,<br>${escapeHtml(company)}</p>
      </div>
    `,
    attachments: [
      { filename: attachment.filename, content: attachment.content }
    ]
  });
}

export async function sendAccountInvitation({
  to,
  employeeName,
  employeeCode,
  companyName,
  activationUrl,
  expiresAt
}) {
  const expiry = new Date(expiresAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });
  const company = companyName || 'SRSB Workforce Solutions';

  await sendWithResend({
    to,
    subject: `Activate your ${company} employee account`,
    text: `Hello ${employeeName},

Welcome to ${company}. Your employee account has been created.

Employee ID: ${employeeCode}

Open the link below to verify your email address and create your password:
${activationUrl}

This link can be used once and expires on ${expiry} (IST).
After activation, sign in with your Employee ID and the password you created.

If you did not expect this email, you can ignore it.

Regards,
${company}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:560px">
        <h2>Activate your employee account</h2>
        <p>Hello ${escapeHtml(employeeName)},</p>
        <p>Welcome to ${escapeHtml(company)}. Your employee account has been created.</p>
        <p><strong>Employee ID:</strong> ${escapeHtml(employeeCode)}</p>
        <p>Verify your email address and create your password:</p>
        <p>
          <a href="${escapeHtml(activationUrl)}"
             style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
            Activate my account
          </a>
        </p>
        <p style="font-size:13px;color:#555">
          This link can be used once and expires on ${escapeHtml(expiry)} (IST).
          If the button does not work, copy this address into your browser:<br>
          <span style="word-break:break-all">${escapeHtml(activationUrl)}</span>
        </p>
        <p>After activation, sign in with your Employee ID and the password you created.</p>
        <p style="font-size:13px;color:#555">If you did not expect this email, you can ignore it.</p>
        <p>Regards,<br>${escapeHtml(company)}</p>
      </div>
    `
  });
}
