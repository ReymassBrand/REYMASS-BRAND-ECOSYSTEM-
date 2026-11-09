/**
 * REYMASS ONE
 * Email Logging & Delivery Tracking Service
 *
 * Maintains an auditable record of outgoing email notifications.
 */

const db = require('../db');

const VALID_STATUSES = [
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'BOUNCED',
  'COMPLAINED',
  'RECONCILIATION_REQUIRED'
];

const createLog = async ({
  recipient,
  subject,
  notificationType,
  customerId = null,
  invoiceId = null,
  paymentId = null,
  workOrderId = null,
  provider = 'RESEND',
  idempotencyKey = null
}) => {
  if (!recipient || !recipient.trim()) {
    throw new Error('Email recipient is required.');
  }

  if (!subject || !subject.trim()) {
    throw new Error('Email subject is required.');
  }

  if (!notificationType || !notificationType.trim()) {
    throw new Error('Notification type is required.');
  }

  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(idempotencyKey);

    if (existing) {
      return {
        created: false,
        duplicate: true,
        log: existing
      };
    }
  }

  const record = {
    recipient: recipient.trim(),
    subject: subject.trim(),
    notification_type: notificationType.trim(),
    customer_id: customerId,
    invoice_id: invoiceId,
    payment_id: paymentId,
    work_order_id: workOrderId,
    provider,
    status: 'QUEUED',
    idempotency_key: idempotencyKey
  };

  try {
    const [id] = await db('email_logs').insert(record);

    return {
      created: true,
      duplicate: false,
      log: await db('email_logs').where({ id }).first()
    };
  } catch (error) {
    // Handle concurrent requests using the unique database constraint.
    if (idempotencyKey && /unique constraint/i.test(error.message)) {
      const existing = await findByIdempotencyKey(idempotencyKey);

      if (existing) {
        return {
          created: false,
          duplicate: true,
          log: existing
        };
      }
    }

    throw error;
  }
};

const findByIdempotencyKey = async (idempotencyKey) => {
  if (!idempotencyKey) return null;

  const record = await db('email_logs')
    .where({ idempotency_key: idempotencyKey })
    .first();

  return record || null;
};
const findByProviderMessageId = async (providerMessageId) => {
  if (!providerMessageId || !providerMessageId.trim()) {
    return null;
  }

  const record = await db('email_logs')
    .where({ provider_message_id: providerMessageId.trim() })
    .first();

  return record || null;
};
const updateStatus = async (id, status, extraFields = {}) => {
  if (!id) {
    throw new Error('Email log ID is required.');
  }

  if (!VALID_STATUSES.includes(status)) {
    throw new Error('Invalid email status.');
  }

  const existing = await db('email_logs').where({ id }).first();

  if (!existing) {
    throw new Error('Email log not found.');
  }

  const allowedTransitions = {
    QUEUED: ['SENT', 'FAILED', 'RECONCILIATION_REQUIRED'],
    SENT: ['DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED'],
    RECONCILIATION_REQUIRED: ['SENT', 'DELIVERED', 'FAILED'],
    DELIVERED: [],
    FAILED: [],
    BOUNCED: [],
    COMPLAINED: []
  };

  if (!allowedTransitions[existing.status]?.includes(status)) {
    throw new Error(
      `Invalid email status transition: ${existing.status} -> ${status}`
    );
  }

  const update = {
    status,
    updated_at: db.fn.now(),
    ...extraFields
  };

  await db('email_logs').where({ id }).update(update);

  return db('email_logs').where({ id }).first();
};

const markSent = async (id, providerMessageId) => {
  if (!providerMessageId || !providerMessageId.trim()) {
    throw new Error('Provider message ID is required.');
  }

  return updateStatus(id, 'SENT', {
    provider_message_id: providerMessageId.trim(),
    sent_at: db.fn.now(),
    error_message: null
  });
};

const markDelivered = async (id) => {
  return updateStatus(id, 'DELIVERED', {
    delivered_at: db.fn.now(),
    error_message: null
  });
};
const markReconciliationRequired = async (id, reason) => {
  return updateStatus(id, 'RECONCILIATION_REQUIRED', {
    error_message: reason
      ? String(reason).slice(0, 5000)
      : 'Email outcome requires reconciliation.'
  });
};
const markFailed = async (id, errorMessage) => {
  return updateStatus(id, 'FAILED', {
    error_message: errorMessage
      ? String(errorMessage).slice(0, 5000)
      : 'Email delivery failed.'
  });
};

const markBounced = async (id, reason) => {
  return updateStatus(id, 'BOUNCED', {
    error_message: reason
      ? String(reason).slice(0, 5000)
      : 'Email bounced.'
  });
};

const markComplained = async (id, reason) => {
  return updateStatus(id, 'COMPLAINED', {
    error_message: reason
      ? String(reason).slice(0, 5000)
      : 'Recipient reported this email as spam.'
  });
};

module.exports = {
  createLog,
  findByIdempotencyKey,
  findByProviderMessageId,
  markSent,
  markDelivered,
  markFailed,
  markBounced,
  markComplained,
  markReconciliationRequired
};