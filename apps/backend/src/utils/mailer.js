import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { AppError } from './AppError.js';

function getTransporter() {
  if (
    !env.smtpHost ||
    !env.smtpUser ||
    !env.smtpPassword ||
    !env.smtpFromEmail
  ) {
    throw new AppError(
      'Email service is not configured.',
      500
    );
  }

  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPassword
    }
  });
}

export async function sendPasswordResetOtp({
  to,
  employeeName,
  otp
}) {
  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"${env.smtpFromName}" <${env.smtpFromEmail}>`,
    to,
    subject: 'SRSB HRMS Password Reset OTP',
    text: `Hello ${employeeName},

Your password reset OTP is ${otp}.

This OTP will expire in ${env.otpExpiryMinutes} minutes.

Do not share this OTP with anyone.

Regards,
SRSB Workforce Solutions`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>Password Reset OTP</h2>
        <p>Hello ${employeeName},</p>
        <p>Your OTP is:</p>
        <div style="font-size:28px;font-weight:bold;letter-spacing:6px">
          ${otp}
        </div>
        <p>
          This OTP will expire in
          ${env.otpExpiryMinutes} minutes.
        </p>
        <p>Do not share this OTP with anyone.</p>
        <p>Regards,<br>SRSB Workforce Solutions</p>
      </div>
    `
  });
}