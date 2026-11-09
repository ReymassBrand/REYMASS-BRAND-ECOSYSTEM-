jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSend
    }
  }))
}));

const mockSend = jest.fn();

const { Resend } = require('resend');
const emailService = require('../services/emailService');

describe('REYMASS ONE - Email Service', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.EMAIL_FROM =
      'REYMASS BRAND <notifications@reymassbrand.co.ke>';

    mockSend.mockReset();
    Resend.mockClear();
  });

  afterAll(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  describe('Configuration', () => {
    test('should report configured when credentials exist', () => {
      expect(emailService.isConfigured()).toBe(true);
    });

    test('should report not configured when API key is missing', () => {
      delete process.env.RESEND_API_KEY;

      expect(emailService.isConfigured()).toBe(false);
    });
  });

  describe('sendEmail', () => {
    test('should send an email successfully', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'test-email-123' },
        error: null
      });

      const result = await emailService.sendEmail({
        to: 'customer@example.com',
        subject: 'Welcome to REYMASS',
        html: '<h1>Welcome</h1>',
        text: 'Welcome to REYMASS'
      });

      expect(result).toEqual({
        success: true,
        messageId: 'test-email-123'
      });

      expect(mockSend).toHaveBeenCalledWith({
        from: 'REYMASS BRAND <notifications@reymassbrand.co.ke>',
        to: 'customer@example.com',
        subject: 'Welcome to REYMASS',
        html: '<h1>Welcome</h1>',
        text: 'Welcome to REYMASS'
      });
    });

    test('should reject missing recipient', async () => {
      await expect(
        emailService.sendEmail({
          subject: 'Test',
          text: 'Test message'
        })
      ).rejects.toThrow('At least one email recipient is required.');
    });

    test('should reject empty recipient list', async () => {
      await expect(
        emailService.sendEmail({
          to: [],
          subject: 'Test',
          text: 'Test message'
        })
      ).rejects.toThrow('At least one email recipient is required.');
    });

    test('should reject missing subject', async () => {
      await expect(
        emailService.sendEmail({
          to: 'customer@example.com',
          text: 'Test message'
        })
      ).rejects.toThrow('Email subject is required.');
    });

    test('should reject missing email content', async () => {
      await expect(
        emailService.sendEmail({
          to: 'customer@example.com',
          subject: 'Test'
        })
      ).rejects.toThrow('Email content is required.');
    });

    test('should report Resend delivery errors', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'Domain not verified' }
      });

      await expect(
        emailService.sendEmail({
          to: 'customer@example.com',
          subject: 'Test',
          text: 'Test message'
        })
      ).rejects.toThrow('Email delivery failed: Domain not verified');
    });

    test('should reject provider responses without a message ID', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: null
      });

      await expect(
        emailService.sendEmail({
          to: 'customer@example.com',
          subject: 'Test',
          text: 'Test message'
        })
      ).rejects.toThrow(
        'Email provider returned no confirmation ID.'
      );
    });
  });
});