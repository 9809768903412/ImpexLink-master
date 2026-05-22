const { Resend } = require('resend');
const nodemailer = require('nodemailer');

let resendClient = null;
let resendClientKey = null;
let smtpTransporter = null;
let smtpTransportKey = null;

function cleanEnvValue(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '').trim();
}

function firstEnv(...keys) {
  for (const key of keys) {
    const value = cleanEnvValue(process.env[key]);
    if (value) return value;
  }
  return '';
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
  if (provider === 'brevo') {
    return Boolean(cleanEnvValue(process.env.BREVO_API_KEY) && getFromAddress());
  }
  if (provider === 'postmark') {
    return Boolean(cleanEnvValue(process.env.POSTMARK_SERVER_TOKEN) && getFromAddress());
  }
  if (provider === 'mailjet') {
    return Boolean(cleanEnvValue(process.env.MAILJET_API_KEY) && cleanEnvValue(process.env.MAILJET_API_SECRET) && getFromAddress());
  }
  return Boolean(cleanEnvValue(process.env.RESEND_API_KEY) && getFromAddress());
}

function getEmailProvider() {
  const configured = cleanEnvValue(process.env.EMAIL_PROVIDER || process.env.MAIL_PROVIDER).toLowerCase();
  if (configured) return configured;
  return 'smtp';
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
  return firstEnv(
    'EMAIL_FROM',
    'MAIL_FROM',
    'SMTP_FROM',
    'BREVO_FROM',
    'POSTMARK_FROM',
    'MAILJET_FROM',
    'RESEND_FROM',
    'SMTP_USER',
    'SMTP_USERNAME',
    'MAIL_USER',
    'MAIL_USERNAME',
    'EMAIL_USER',
    'EMAIL_USERNAME'
  );
}

function getSmtpConfig() {
  const port = Number(firstEnv('SMTP_PORT', 'MAIL_PORT', 'EMAIL_PORT') || 465);
  const encryption = firstEnv('SMTP_SECURE', 'MAIL_SECURE', 'EMAIL_SECURE', 'MAIL_ENCRYPTION', 'SMTP_ENCRYPTION').toLowerCase();
  const secure =
    ['false', '0', 'no', 'none', 'starttls', 'tls'].includes(encryption)
      ? false
      : ['true', '1', 'yes', 'ssl', 'smtps'].includes(encryption)
      ? true
      : port === 465;
  return {
    host: firstEnv('SMTP_HOST', 'MAIL_HOST', 'EMAIL_HOST') || 'smtp.hostinger.com',
    port,
    secure,
    forceIpv4: cleanEnvValue(process.env.SMTP_FORCE_IPV4 || process.env.MAIL_FORCE_IPV4 || 'true') !== 'false',
    user: firstEnv('SMTP_USER', 'SMTP_USERNAME', 'MAIL_USER', 'MAIL_USERNAME', 'EMAIL_USER', 'EMAIL_USERNAME'),
    pass: firstEnv('SMTP_PASS', 'SMTP_PASSWORD', 'MAIL_PASS', 'MAIL_PASSWORD', 'EMAIL_PASS', 'EMAIL_PASSWORD'),
  };
}

function parseAddress(address) {
  const value = cleanEnvValue(address);
  const match = value.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^['"]|['"]$/g, ''),
      email: match[2].trim(),
    };
  }
  return { name: '', email: value };
}

async function postJson(url, headers, payload) {
  if (typeof fetch !== 'function') {
    throw new Error('Node fetch API is not available for email provider requests');
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message =
      (body && typeof body === 'object' && (body.message || body.error || body.Message)) ||
      `Email API request failed with status ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.providerResponse = body;
    throw error;
  }
  return body;
}

async function sendBrevoEmail({ from, to, subject, text, html }) {
  const apiKey = cleanEnvValue(process.env.BREVO_API_KEY);
  if (!apiKey) throw new Error('BREVO_API_KEY is missing');
  const sender = parseAddress(from);
  const payload = {
    sender: sender.name ? { email: sender.email, name: sender.name } : { email: sender.email },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
  };
  const result = await postJson('https://api.brevo.com/v3/smtp/email', { 'api-key': apiKey }, payload);
  if (!result?.messageId) {
    throw new Error('Brevo accepted the request but did not return a message id');
  }
  return result;
}

async function sendPostmarkEmail({ from, to, subject, text, html }) {
  const token = cleanEnvValue(process.env.POSTMARK_SERVER_TOKEN);
  if (!token) throw new Error('POSTMARK_SERVER_TOKEN is missing');
  return postJson(
    'https://api.postmarkapp.com/email',
    { 'X-Postmark-Server-Token': token },
    {
      From: from,
      To: to,
      Subject: subject,
      TextBody: text,
      HtmlBody: html,
      MessageStream: cleanEnvValue(process.env.POSTMARK_MESSAGE_STREAM) || 'outbound',
    }
  );
}

async function sendMailjetEmail({ from, to, subject, text, html }) {
  const apiKey = cleanEnvValue(process.env.MAILJET_API_KEY);
  const apiSecret = cleanEnvValue(process.env.MAILJET_API_SECRET);
  if (!apiKey) throw new Error('MAILJET_API_KEY is missing');
  if (!apiSecret) throw new Error('MAILJET_API_SECRET is missing');
  const sender = parseAddress(from);
  const payload = {
    Messages: [
      {
        From: sender.name ? { Email: sender.email, Name: sender.name } : { Email: sender.email },
        To: [{ Email: to }],
        Subject: subject,
        TextPart: text,
        HTMLPart: html,
      },
    ],
  };
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const result = await postJson('https://api.mailjet.com/v3.1/send', { Authorization: `Basic ${auth}` }, payload);
  const message = result?.Messages?.[0];
  if (!message || String(message.Status || '').toLowerCase() !== 'success') {
    const errors = Array.isArray(message?.Errors) ? message.Errors.map((err) => err.ErrorMessage || err.ErrorCode).join(', ') : '';
    throw new Error(errors || 'Mailjet did not accept the message for delivery');
  }
  return result;
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
    family: config.forceIpv4 ? 4 : undefined,
    requireTLS: !config.secure && config.port === 587,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      servername: config.host,
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
    hasBrevoApiKey: provider === 'brevo' ? Boolean(cleanEnvValue(process.env.BREVO_API_KEY)) : null,
    hasPostmarkServerToken: provider === 'postmark' ? Boolean(cleanEnvValue(process.env.POSTMARK_SERVER_TOKEN)) : null,
    hasMailjetApiKey: provider === 'mailjet' ? Boolean(cleanEnvValue(process.env.MAILJET_API_KEY)) : null,
    hasMailjetApiSecret: provider === 'mailjet' ? Boolean(cleanEnvValue(process.env.MAILJET_API_SECRET)) : null,
    smtpHost: provider === 'smtp' ? smtpConfig.host : null,
    smtpPort: provider === 'smtp' ? smtpConfig.port : null,
    smtpSecure: provider === 'smtp' ? smtpConfig.secure : null,
    smtpForceIpv4: provider === 'smtp' ? smtpConfig.forceIpv4 : null,
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
      const result = await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
        envelope: smtpConfig.user ? { from: smtpConfig.user, to } : undefined,
      });
      if (Array.isArray(result?.rejected) && result.rejected.length > 0) {
        throw new Error(`SMTP rejected recipient(s): ${result.rejected.join(', ')}`);
      }
      if (Array.isArray(result?.accepted) && result.accepted.length === 0) {
        throw new Error('SMTP did not accept any recipient for delivery');
      }
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
    if (provider === 'brevo') {
      const result = await sendBrevoEmail({ from, to, subject, text, html });
      console.log('[mailer] send success', {
        provider,
        to,
        from,
        subject,
        messageId: result?.messageId || null,
      });
      return result;
    }
    if (provider === 'postmark') {
      const result = await sendPostmarkEmail({ from, to, subject, text, html });
      console.log('[mailer] send success', {
        provider,
        to,
        from,
        subject,
        messageId: result?.MessageID || null,
      });
      return result;
    }
    if (provider === 'mailjet') {
      const result = await sendMailjetEmail({ from, to, subject, text, html });
      const message = result?.Messages?.[0];
      console.log('[mailer] send success', {
        provider,
        to,
        from,
        subject,
        messageId: message?.To?.[0]?.MessageID || message?.To?.[0]?.MessageUUID || null,
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
    hasBrevoApiKey: Boolean(cleanEnvValue(process.env.BREVO_API_KEY)),
    brevoApiKeyPrefix: cleanEnvValue(process.env.BREVO_API_KEY) ? `${cleanEnvValue(process.env.BREVO_API_KEY).slice(0, 4)}...` : null,
    hasPostmarkServerToken: Boolean(cleanEnvValue(process.env.POSTMARK_SERVER_TOKEN)),
    postmarkTokenPrefix: cleanEnvValue(process.env.POSTMARK_SERVER_TOKEN) ? `${cleanEnvValue(process.env.POSTMARK_SERVER_TOKEN).slice(0, 4)}...` : null,
    hasMailjetApiKey: Boolean(cleanEnvValue(process.env.MAILJET_API_KEY)),
    mailjetApiKeyPrefix: cleanEnvValue(process.env.MAILJET_API_KEY) ? `${cleanEnvValue(process.env.MAILJET_API_KEY).slice(0, 4)}...` : null,
    hasMailjetApiSecret: Boolean(cleanEnvValue(process.env.MAILJET_API_SECRET)),
    smtpHost: smtpConfig.host || null,
    smtpPort: smtpConfig.port || null,
    smtpSecure: smtpConfig.secure,
    smtpUser: smtpConfig.user ? smtpConfig.user.replace(/^(.{2}).*(@.*)$/, '$1***$2') : null,
    hasSmtpPass: Boolean(smtpConfig.pass),
    hasFromAddress: Boolean(from),
    from,
    fromDomain: from ? from.replace(/^.*<(.+)>$/, '$1').trim().split('@')[1] || null : null,
    smtpFromMatchesUser:
      provider === 'smtp' && from && smtpConfig.user
        ? from.replace(/^.*<(.+)>$/, '$1').trim().toLowerCase() === smtpConfig.user.toLowerCase()
        : null,
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
