const { Resend } = require('resend');

let resendClient = null;
let configuredApiKey = null;

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    throw new Error('Email service is not configured.');
  }

  if (!resendClient || configuredApiKey !== apiKey) {
    resendClient = new Resend(apiKey);
    configuredApiKey = apiKey;
  }

  return resendClient;
};

const getSender = () => {
  const sender = process.env.EMAIL_FROM;

  if (!sender || !sender.trim()) {
    throw new Error('Email sender address is not configured.');
  }

  return sender.trim();
};

const sendEmail = async ({
  to,
  subject,
  html,
  text,
  replyTo
}) => {
  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error('At least one email recipient is required.');
  }

  if (!subject || !subject.trim()) {
    throw new Error('Email subject is required.');
  }

  if (!html && !text) {
    throw new Error('Email content is required.');
  }

  const resend = getResendClient();

  const emailData = {
    from: getSender(),
    to,
    subject: subject.trim()
  };

  if (html) emailData.html = html;
  if (text) emailData.text = text;
  if (replyTo) emailData.replyTo = replyTo;

  const { data, error } = await resend.emails.send(emailData);

  if (error) {
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  if (!data || !data.id) {
    throw new Error('Email provider returned no confirmation ID.');
  }

  return {
    success: true,
    messageId: data.id
  };
};

const isConfigured = () => {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.RESEND_API_KEY.trim() &&
    process.env.EMAIL_FROM &&
    process.env.EMAIL_FROM.trim()
  );
};

module.exports = {
  sendEmail,
  isConfigured
};