const { Resend } = require('resend');

let resendClient = null;
let resendClientKey = null;

function sanitizeEmailError(error) {
  if (!error) return { message: 'Unknown email error' };
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode || error.status,
      code: error.code,
    };
  }
  if (typeof error === 'object') {
    return {
      message: error.message || error.error || 'Unknown email error',
      name: error.name,
      statusCode: error.statusCode || error.status,
      code: error.code,
      raw: error,
    };
  }
  return { message: String(error) };
}

function hasEmailDeliveryConfig() {
  return Boolean(String(process.env.RESEND_API_KEY || '').trim() && getFromAddress());
}

function getResendClient() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (resendClient && resendClientKey === apiKey) return resendClient;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing');
  }
  resendClient = new Resend(apiKey);
  resendClientKey = apiKey;
  return resendClient;
}

function getFromAddress() {
  return String(process.env.RESEND_FROM || process.env.SMTP_FROM || '').trim();
}

async function sendEmail({ to, subject, text, html }) {
  const from = getFromAddress();
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  console.log('[mailer] attempting send', {
    provider: 'resend',
    to,
    from,
    subject,
    hasApiKey: Boolean(apiKey),
    apiKeyPrefix: apiKey ? `${apiKey.slice(0, 3)}...` : null,
    nodeEnv: process.env.NODE_ENV || 'development',
  });
  try {
    if (!from) {
      throw new Error('RESEND_FROM is missing. Set it to a sender on a verified Resend domain, for example Impex Engineering <otp@yourdomain.com>.');
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from.replace(/^.*<(.+)>$/, '$1').trim())) {
      throw new Error(`RESEND_FROM is invalid: ${from}`);
    }
    const client = getResendClient();
    const result = await client.emails.send({ from, to, subject, text, html });
    if (result?.error) {
      const message = result.error.message || result.error.name || 'Email provider rejected the request';
      console.error('[mailer] resend rejected request', {
        to,
        from,
        subject,
        error: result.error,
      });
      throw new Error(message);
    }
    console.log('[mailer] send success', {
      to,
      from,
      subject,
      id: result?.data?.id || result?.id || null,
    });
    return result?.data || result;
  } catch (error) {
    const details = sanitizeEmailError(error);
    console.error('[mailer] send failed', {
      to,
      from,
      subject,
      ...details,
    });
    throw error;
  }
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

function getEmailDiagnostics() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = getFromAddress();
  return {
    provider: 'resend',
    ready: Boolean(apiKey && from),
    hasResendApiKey: Boolean(apiKey),
    resendApiKeyPrefix: apiKey ? `${apiKey.slice(0, 3)}...` : null,
    hasFromAddress: Boolean(from),
    from,
    fromDomain: from ? from.replace(/^.*<(.+)>$/, '$1').trim().split('@')[1] || null : null,
    nodeEnv: process.env.NODE_ENV || 'development',
    requireEmailOtpDelivery: process.env.REQUIRE_EMAIL_OTP_DELIVERY === 'true',
    allowDevOtp: process.env.ALLOW_DEV_OTP || null,
  };
}

module.exports = {
  sendEmail,
  sendOtpEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  getEmailDiagnostics,
  sanitizeEmailError,
  hasEmailDeliveryConfig,
};
