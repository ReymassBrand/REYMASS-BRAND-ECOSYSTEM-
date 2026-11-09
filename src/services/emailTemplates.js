const COMPANY = {
  name: 'REYMASS BRAND INVESTMENT LTD',
  product: 'REYMASS ONE',
  slogan: 'The Signature of Excellence',
  email: 'reymassbrand@gmail.com',
  website: 'https://reymassbrand.co.ke',
  primaryColor: '#102A43',
  goldColor: '#D4AF37'
};

// Safely escape dynamic content before inserting it into HTML.
const escapeHtml = (value = '') => {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return entities[character];
  });
};

// Reusable branded email layout.
const createEmailLayout = ({
  title,
  recipientName,
  content,
  actionText,
  actionUrl
}) => {
  const safeTitle = escapeHtml(title);
  const safeName = escapeHtml(recipientName || 'Valued Customer');

  const actionButton = actionText && actionUrl
    ? `
      <div style="text-align:center;margin:30px 0;">
        <a href="${escapeHtml(actionUrl)}"
           style="
             background-color:${COMPANY.primaryColor};
             color:#ffffff;
             padding:14px 28px;
             text-decoration:none;
             border-radius:6px;
             font-weight:bold;
             display:inline-block;
           ">
          ${escapeHtml(actionText)}
        </a>
      </div>
    `
    : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>

<body style="
  margin:0;
  padding:20px;
  background-color:#f3f5f8;
  font-family:Arial,Helvetica,sans-serif;
  color:#334155;
">

  <div style="
    max-width:620px;
    margin:0 auto;
    background:#ffffff;
    border-radius:10px;
    overflow:hidden;
    border:1px solid #e5e7eb;
  ">

    <div style="
      background:${COMPANY.primaryColor};
      padding:30px 20px;
      text-align:center;
      border-bottom:5px solid ${COMPANY.goldColor};
    ">
      <h1 style="
        margin:0;
        color:${COMPANY.goldColor};
        font-size:28px;
        letter-spacing:2px;
      ">
        REYMASS
      </h1>

      <p style="
        margin:8px 0 0;
        color:#ffffff;
        font-size:13px;
        letter-spacing:2px;
      ">
        ONE
      </p>
    </div>

    <div style="padding:35px 30px;">

      <h2 style="
        color:${COMPANY.primaryColor};
        margin-top:0;
        font-size:22px;
      ">
        ${safeTitle}
      </h2>

      <p style="font-size:15px;line-height:1.7;">
        Dear ${safeName},
      </p>

      <div style="font-size:15px;line-height:1.8;">
        ${content}
      </div>

      ${actionButton}

      <p style="font-size:15px;line-height:1.7;">
        Thank you for choosing REYMASS.
      </p>

      <p style="
        color:${COMPANY.primaryColor};
        font-weight:bold;
        margin-bottom:4px;
      ">
        ${COMPANY.name}
      </p>

      <p style="
        color:#64748b;
        font-size:12px;
        margin-top:0;
      ">
        ${COMPANY.slogan}
      </p>

    </div>

    <div style="
      background:#f8fafc;
      padding:22px;
      text-align:center;
      border-top:1px solid #e5e7eb;
    ">

      <p style="font-size:12px;color:#64748b;">
        This is an automated notification from REYMASS ONE.
      </p>

      <p style="font-size:12px;color:#64748b;">
        Email:
        <a href="mailto:${COMPANY.email}"
           style="color:${COMPANY.primaryColor};">
          ${COMPANY.email}
        </a>
      </p>

      <p style="font-size:12px;">
        <a href="${COMPANY.website}"
           style="color:${COMPANY.primaryColor};">
          ${COMPANY.website}
        </a>
      </p>

      <p style="font-size:11px;color:#94a3b8;">
        &copy; ${new Date().getFullYear()} ${COMPANY.name}.
        All rights reserved.
      </p>

    </div>

  </div>

</body>
</html>
`;

  const text = `
${COMPANY.product}
${COMPANY.name}

${safeTitle}

Dear ${safeName},

${content.replace(/<[^>]*>/g, '').trim()}

Thank you for choosing REYMASS.

${COMPANY.slogan}
${COMPANY.email}
${COMPANY.website}
`;

  return { html, text };
};

// Customer welcome email.
const welcomeEmail = ({ customerName }) => {
  return createEmailLayout({
    title: 'Welcome to REYMASS',
    recipientName: customerName,
    content: `
      <p>
        We are delighted to welcome you to REYMASS.
      </p>

      <p>
        Your relationship with us is important, and we look forward
        to providing you with professional, reliable services.
      </p>
    `
  });
};

// Invoice notification.
const invoiceEmail = ({
  customerName,
  invoiceNumber,
  amount,
  dueDate
}) => {
  return createEmailLayout({
    title: 'Your Invoice Is Ready',
    recipientName: customerName,
    content: `
      <p>Your invoice has been prepared.</p>

      <p>
        <strong>Invoice Number:</strong>
        ${escapeHtml(invoiceNumber)}
      </p>

      <p>
        <strong>Amount Due:</strong>
        ${escapeHtml(amount)}
      </p>

      <p>
        <strong>Due Date:</strong>
        ${escapeHtml(dueDate)}
      </p>
    `
  });
};

// M-Pesa payment confirmation.
const paymentConfirmationEmail = ({
  customerName,
  amount,
  receiptNumber,
  paymentDate
}) => {
  return createEmailLayout({
    title: 'Payment Confirmation',
    recipientName: customerName,
    content: `
      <p>We have received your payment notification.</p>

      <p>
        <strong>Amount:</strong>
        ${escapeHtml(amount)}
      </p>

      <p>
        <strong>M-Pesa Receipt:</strong>
        ${escapeHtml(receiptNumber)}
      </p>

      <p>
        <strong>Payment Date:</strong>
        ${escapeHtml(paymentDate)}
      </p>
    `
  });
};

// Work-order notification.
const workOrderEmail = ({
  customerName,
  workOrderNumber,
  status,
  description
}) => {
  return createEmailLayout({
    title: 'Work Order Update',
    recipientName: customerName,
    content: `
      <p>Your work order has an update.</p>

      <p>
        <strong>Work Order:</strong>
        ${escapeHtml(workOrderNumber)}
      </p>

      <p>
        <strong>Status:</strong>
        ${escapeHtml(status)}
      </p>

      <p>
        <strong>Description:</strong>
        ${escapeHtml(description)}
      </p>
    `
  });
};

// Password-reset email.
const passwordResetEmail = ({
  customerName,
  resetUrl
}) => {
  return createEmailLayout({
    title: 'Password Reset Request',
    recipientName: customerName,
    content: `
      <p>
        We received a request to reset your REYMASS ONE password.
      </p>

      <p>
        If you requested this change, use the button below to continue.
      </p>

      <p>
        If you did not request a password reset, please ignore this email.
      </p>
    `,
    actionText: 'Reset My Password',
    actionUrl: resetUrl
  });
};

module.exports = {
  escapeHtml,
  createEmailLayout,
  welcomeEmail,
  invoiceEmail,
  paymentConfirmationEmail,
  workOrderEmail,
  passwordResetEmail
};