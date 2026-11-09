require('dotenv').config();

const db = require('../db');
const emailLogService = require('../services/emailLogService');

describe('REYMASS ONE - Email Logging Service', () => {
  beforeAll(async () => {
    await db.migrate.latest();
  });

  afterAll(async () => {
    await db.destroy();
  });

  const createTestLog = async (overrides = {}) => {
    return emailLogService.createLog({
      recipient: 'customer@example.com',
      subject: 'REYMASS Test Notification',
      notificationType: 'TEST_NOTIFICATION',
      ...overrides
    });
  };

  describe('createLog', () => {
    test('should create an email log successfully', async () => {
      const result = await createTestLog();

      expect(result.created).toBe(true);
      expect(result.duplicate).toBe(false);
      expect(result.log.recipient).toBe('customer@example.com');
      expect(result.log.status).toBe('QUEUED');
      expect(result.log.provider).toBe('RESEND');
    });

    test('should trim recipient and subject', async () => {
      const result = await createTestLog({
        recipient: ' customer@example.com ',
        subject: ' Welcome to REYMASS '
      });

      expect(result.log.recipient).toBe('customer@example.com');
      expect(result.log.subject).toBe('Welcome to REYMASS');
    });

    test('should reject missing recipient', async () => {
      await expect(
        createTestLog({ recipient: '' })
      ).rejects.toThrow('Email recipient is required.');
    });

    test('should reject missing subject', async () => {
      await expect(
        createTestLog({ subject: '' })
      ).rejects.toThrow('Email subject is required.');
    });

    test('should reject missing notification type', async () => {
      await expect(
        createTestLog({ notificationType: '' })
      ).rejects.toThrow('Notification type is required.');
    });

    test('should prevent duplicate idempotency keys', async () => {
      const key = `EMAIL-TEST-${Date.now()}`;

      const first = await createTestLog({
        idempotencyKey: key
      });

      const second = await createTestLog({
        idempotencyKey: key
      });

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.duplicate).toBe(true);
      expect(second.log.id).toBe(first.log.id);
    });
  });

  describe('findByIdempotencyKey', () => {
    test('should find an existing email log', async () => {
      const key = `EMAIL-FIND-${Date.now()}`;

      const created = await createTestLog({
        idempotencyKey: key
      });

      const found = await emailLogService.findByIdempotencyKey(key);

      expect(found).toBeDefined();
      expect(found.id).toBe(created.log.id);
    });

    test('should return null for an unknown key', async () => {
      const result = await emailLogService.findByIdempotencyKey(
        'UNKNOWN-EMAIL-KEY'
      );

      expect(result).toBeNull();
    });
test('should find an email log by provider message ID', async () => {
  const created = await createTestLog();

  await emailLogService.markSent(
    created.log.id,
    'resend-lookup-001'
  );

  const found = await emailLogService.findByProviderMessageId(
    'resend-lookup-001'
  );

  expect(found).toBeDefined();
  expect(found.id).toBe(created.log.id);
});

test('should return null for an unknown provider message ID', async () => {
  const result = await emailLogService.findByProviderMessageId(
    'unknown-resend-message'
  );

  expect(result).toBeNull();
});
  });

  describe('Email delivery lifecycle', () => {
    test('should mark an email as sent', async () => {
      const created = await createTestLog();

      const result = await emailLogService.markSent(
        created.log.id,
        'resend-message-001'
      );

      expect(result.status).toBe('SENT');
      expect(result.provider_message_id).toBe('resend-message-001');
      expect(result.sent_at).toBeDefined();
    });

    test('should mark a sent email as delivered', async () => {
      const created = await createTestLog();

      await emailLogService.markSent(
        created.log.id,
        'resend-message-002'
      );

      const result = await emailLogService.markDelivered(
        created.log.id
      );

      expect(result.status).toBe('DELIVERED');
      expect(result.delivered_at).toBeDefined();
    });

    test('should mark a queued email as failed', async () => {
      const created = await createTestLog();

      const result = await emailLogService.markFailed(
        created.log.id,
        'Provider rejected request'
      );

      expect(result.status).toBe('FAILED');
      expect(result.error_message).toBe('Provider rejected request');
    });

    test('should mark a sent email as bounced', async () => {
      const created = await createTestLog();

      await emailLogService.markSent(
        created.log.id,
        'resend-message-003'
      );

      const result = await emailLogService.markBounced(
        created.log.id,
        'Recipient address does not exist'
      );

      expect(result.status).toBe('BOUNCED');
      expect(result.error_message).toBe(
        'Recipient address does not exist'
      );
    });

    test('should mark a sent email as complained', async () => {
      const created = await createTestLog();

      await emailLogService.markSent(
        created.log.id,
        'resend-message-004'
      );

      const result = await emailLogService.markComplained(
        created.log.id,
        'Recipient reported spam'
      );

      expect(result.status).toBe('COMPLAINED');
      expect(result.error_message).toBe(
        'Recipient reported spam'
      );
    });
test('should mark an email as requiring reconciliation', async () => {
  const created = await createTestLog();

  const result = await emailLogService.markReconciliationRequired(
    created.log.id,
    'Network timeout during provider request'
  );

  expect(result.status).toBe('RECONCILIATION_REQUIRED');
  expect(result.error_message).toBe(
    'Network timeout during provider request'
  );
});

test('should allow reconciliation to confirm an email as sent', async () => {
  const created = await createTestLog();

  await emailLogService.markReconciliationRequired(
    created.log.id,
    'Uncertain provider response'
  );

  const result = await emailLogService.markSent(
    created.log.id,
    'resend-reconciled-001'
  );

  expect(result.status).toBe('SENT');
  expect(result.provider_message_id).toBe('resend-reconciled-001');
});
  });

  describe('Validation and status transitions', () => {
    test('should reject missing email log ID', async () => {
      await expect(
        emailLogService.markDelivered(null)
      ).rejects.toThrow('Email log ID is required.');
    });

    test('should reject nonexistent email log', async () => {
      await expect(
        emailLogService.markDelivered(999999)
      ).rejects.toThrow('Email log not found.');
    });

    test('should reject missing provider message ID', async () => {
      const created = await createTestLog();

      await expect(
        emailLogService.markSent(created.log.id, '')
      ).rejects.toThrow('Provider message ID is required.');
    });

    test('should reject delivery before sending', async () => {
      const created = await createTestLog();

      await expect(
        emailLogService.markDelivered(created.log.id)
      ).rejects.toThrow('Invalid email status transition');
    });

    test('should reject changing a delivered email to failed', async () => {
      const created = await createTestLog();

      await emailLogService.markSent(
        created.log.id,
        'resend-message-005'
      );

      await emailLogService.markDelivered(created.log.id);

      await expect(
        emailLogService.markFailed(
          created.log.id,
          'Late failure'
        )
      ).rejects.toThrow('Invalid email status transition');
    });

    test('should reject marking a failed email as delivered', async () => {
      const created = await createTestLog();

      await emailLogService.markFailed(
        created.log.id,
        'Initial failure'
      );

      await expect(
        emailLogService.markDelivered(created.log.id)
      ).rejects.toThrow('Invalid email status transition');
    });
  });
});