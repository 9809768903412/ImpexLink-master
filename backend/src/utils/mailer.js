const { Resend } = require('resend');
const nodemailer = require('nodemailer');

let resendClient = null;
let resendClientKey = null;
let smtpTransporter = null;
let smtpTransportKey = null;

function cleanEnvValue(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '').trim();
}

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
  const provider = getEmailProvider();
  if (provider === 'smtp') {
    return Boolean(getSmtpConfig().host && getSmtpConfig().user && getSmtpConfig().pass && getFromAddress());
  }
  return Boolean(cleanEnvValue(process.env.RESEND_API_KEY) && getFromAddress());
}

function getEmailProvider() {
  const configured = cleanEnvValue(process.env.EMAIL_PROVIDER || process.env.MAIL_PROVIDER).toLowerCase();
  if (configured) return configured;
  if (cleanEnvValue(process.env.SMTP_HOST)) return 'smtp';
  return 'resend';
}

function getResendClient() {
  const apiKey = cleanEnvValue(process.env.RESEND_API_KEY);
  if (resendClient && resendClientKey === apiKey) return resendClient;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing');
  }
  resendClient = new Resend(apiKey);
  resendClientKey = apiKey;
  return resendClient;
}

function getFromAddress() {
  return cleanEnvValue(
    process.env.EMAIL_FROM ||
      process.env.MAIL_FROM ||
      process.env.SMTP_FROM ||
      process.env.RESEND_FROM ||
      process.env.SMTP_USER
  );
}

function getSmtpConfig() {
  const port = Number(cleanEnvValue(process.env.SMTP_PORT) || 465);
  return {
    host: cleanEnvValue(process.env.SMTP_HOST || 'smtp.hostinger.com'),
    port,
    secure: cleanEnvValue(process.env.SMTP_SECURE).toLowerCase() === 'false' ? false : port === 465,
    user: cleanEnvValue(process.env.SMTP_USER),
    pass: cleanEnvValue(process.env.SMTP_PASS || process.env.SMTP_PASSWORD),
  };
}

function getSmtpTransporter() {
  const config = getSmtpConfig();
  const key = JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
  });
  if (smtpTransporter && smtpTransportKey === key) return smtpTransporter;
  if (!config.host) throw new Error('SMTP_HOST is missing');
  if (!config.user) throw new Error('SMTP_USER is missing');
  if (!config.pass) throw new Error('SMTP_PASS is missing');
  smtpTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 15000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000),
  });
  smtpTransportKey = key;
  return smtpTransporter;
}

async function sendEmail({ to, subject, text, html }) {
  const provider = getEmailProvider();
  const from = getFromAddress();
  const apiKey = cleanEnvValue(process.env.RESEND_API_KEY);
  const smtpConfig = getSmtpConfig();
  console.log('[mailer] attempting send', {
    provider,
    to,
    from,
    subject,
    hasResendApiKey: Boolean(apiKey),
    resendApiKeyPrefix: apiKey ? `${apiKey.slice(0, 3)}...` : null,
    smtpHost: provider === 'smtp' ? smtpConfig.host : null,
    smtpPort: provider === 'smtp' ? smtpConfig.port : null,
    smtpSecure: provider === 'smtp' ? smtpConfig.secure : null,
    hasSmtpUser: provider === 'smtp' ? Boolean(smtpConfig.user) : null,
    hasSmtpPass: provider === 'smtp' ? Boolean(smtpConfig.pass) : null,
    nodeEnv: process.env.NODE_ENV || 'development',
  });
  try {
    if (!from) {
      throw new Error('EMAIL_FROM is missing. For Hostinger, set it to your mailbox address, for example Impex Engineering <your-mailbox@impexengineering.org>.');
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from.replace(/^.*<(.+)>$/, '$1').trim())) {
      throw new Error(`Email from address is invalid: ${from}`);
    }
    if (provider === 'smtp') {
      const transporter = getSmtpTransporter();
      const result = await transporter.sendMail({ from, to, subject, text, html });
      console.log('[mailer] send success', {
        provider,
        to,
        from,
        subject,
        messageId: result?.messageId || null,
        accepted: result?.accepted || [],
        rejected: result?.rejected || [],
      });
      return result;
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
      provider,
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
  const provider = getEmailProvider();
  const apiKey = cleanEnvValue(process.env.RESEND_API_KEY);
  const from = getFromAddress();
  const smtpConfig = getSmtpConfig();
  const resendEnvKeys = Object.keys(process.env)
    .filter((key) => key.toUpperCase().includes('RESEND'))
    .sort();
  const smtpEnvKeys = Object.keys(process.env)
    .filter((key) => key.toUpperCase().includes('SMTP') || key.toUpperCase().includes('EMAIL_') || key.toUpperCase().includes('MAIL_'))
    .sort();
  return {
    provider,
    ready: hasEmailDeliveryConfig(),
    hasResendApiKey: Boolean(apiKey),
    resendApiKeyPrefix: apiKey ? `${apiKey.slice(0, 3)}...` : null,
    smtpHost: smtpConfig.host || null,
    smtpPort: smtpConfig.port || null,
    smtpSecure: smtpConfig.secure,
    smtpUser: smtpConfig.user ? smtpConfig.user.replace(/^(.{2}).*(@.*)$/, '$1***$2') : null,
    hasSmtpPass: Boolean(smtpConfig.pass),
    hasFromAddress: Boolean(from),
    from,
    fromDomain: from ? from.replace(/^.*<(.+)>$/, '$1').trim().split('@')[1] || null : null,
    nodeEnv: process.env.NODE_ENV || 'development',
    requireEmailOtpDelivery: process.env.REQUIRE_EMAIL_OTP_DELIVERY === 'true',
    allowDevOtp: process.env.ALLOW_DEV_OTP || null,
    resendEnvKeys,
    smtpEnvKeys,
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
