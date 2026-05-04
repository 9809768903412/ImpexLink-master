const { Resend } = require('resend');

let resendClient = null;

function getResendClient() {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing');
  }
  resendClient = new Resend(apiKey);
  return resendClient;
}

function getFromAddress() {
  return process.env.RESEND_FROM || process.env.SMTP_FROM || 'no-reply@impexengineering.local';
}

async function sendEmail({ to, subject, text, html }) {
  const from = getFromAddress();
  const client = getResendClient();
  const result = await client.emails.send({ from, to, subject, text, html });
  if (result?.error) {
    const message = result.error.message || result.error.name || 'Email provider rejected the request';
    throw new Error(message);
  }
  return result?.data || result;
}

async function sendOtpEmail(to, otp) {
  const subject = 'Impex Engineering login verification code';
  const text = `Your Impex Engineering login code is ${otp}. It expires in 10 minutes.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Impex Engineering Login Verification</h2>
      <p>Use the code below to complete your login:</p>
      <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${otp}</div>
      <p>This code expires in 10 minutes.</p>
      <p style="color:#666;font-size:12px;">If you did not attempt to log in, you can ignore this email.</p>
    </div>
  `;
  await sendEmail({ to, subject, text, html });
}

async function sendVerificationEmail(to, otp) {
  const subject = 'Verify your Impex Engineering account';
  const text = `Your Impex Engineering verification code is ${otp}. It expires in 15 minutes.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Verify your Impex Engineering account</h2>
      <p>Use the code below to verify your email:</p>
      <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${otp}</div>
      <p>This code expires in 15 minutes.</p>
      <p style="color:#666;font-size:12px;">If you did not request this, ignore this email.</p>
    </div>
  `;
  await sendEmail({ to, subject, text, html });
}

async function sendPasswordResetEmail(to, otp) {
  const subject = 'Reset your Impex Engineering password';
  const text = `Your Impex Engineering password reset code is ${otp}. It expires in 15 minutes.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Reset your Impex Engineering password</h2>
      <p>Use the code below to reset your password:</p>
      <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${otp}</div>
      <p>This code expires in 15 minutes.</p>
      <p style="color:#666;font-size:12px;">If you did not request this, ignore this email.</p>
    </div>
  `;
  await sendEmail({ to, subject, text, html });
}

module.exports = { sendOtpEmail, sendVerificationEmail, sendPasswordResetEmail };
