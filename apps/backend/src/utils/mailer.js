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
  html
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
        html
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
