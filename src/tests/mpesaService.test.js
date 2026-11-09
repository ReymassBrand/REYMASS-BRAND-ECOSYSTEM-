const originalEnv = { ...process.env };
const originalFetch = global.fetch;

const SANDBOX_CONFIG = {
  MPESA_ENV: 'sandbox',
  MPESA_CONSUMER_KEY: 'test-consumer-key',
  MPESA_CONSUMER_SECRET: 'test-consumer-secret',
  MPESA_SHORTCODE: '174379',
  MPESA_PASSKEY: 'test-passkey',
  MPESA_CALLBACK_URL: 'https://example.test/mpesa/callback'
};

function mockResponse(data, options = {}) {
  const { status = 200, ok = status >= 200 && status < 300 } = options;

  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(data)
  };
}

describe('REYMASS ONE - M-Pesa Service', () => {
  let mpesaService;

  beforeEach(() => {
    jest.resetModules();

    process.env = {
      ...originalEnv,
      ...SANDBOX_CONFIG
    };

    global.fetch = jest.fn();

    mpesaService = require('../services/mpesaService');
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe('Sandbox configuration', () => {
    test('rejects non-sandbox mode', async () => {
      process.env.MPESA_ENV = 'production';

      await expect(
        mpesaService.getAccessToken()
      ).rejects.toThrow(
        'M-Pesa service is restricted to sandbox mode.'
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('rejects a missing consumer key', async () => {
      process.env.MPESA_CONSUMER_KEY = '';

      await expect(
        mpesaService.getAccessToken()
      ).rejects.toThrow(
        'M-Pesa configuration is missing or invalid: consumerKey'
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('rejects a non-HTTPS callback URL when initiating STK Push', async () => {
      process.env.MPESA_CALLBACK_URL =
        'http://example.test/mpesa/callback';

      await expect(
        mpesaService.initiateStkPush({
          phoneNumber: '0712345678',
          amount: 100,
          accountReference: 'INV100'
        })
      ).rejects.toThrow(
        'MPESA_CALLBACK_URL must use HTTPS.'
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Access token', () => {
   test('requests a token using sandbox credentials', async () => {
  global.fetch.mockResolvedValue(
       mockResponse({
          access_token: 'sandbox-access-token'
        })
      );

      await expect(
        mpesaService.getAccessToken()
      ).resolves.toBe('sandbox-access-token');

      expect(global.fetch).toHaveBeenCalledTimes(1);

      const [url, options] = global.fetch.mock.calls[0];

      expect(url).toBe(
        'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
      );

      expect(options.method).toBe('GET');

      expect(options.headers.Authorization).toBe(
        `Basic ${Buffer.from(
          'test-consumer-key:test-consumer-secret'
        ).toString('base64')}`
      );
    });

    test('rejects an unsuccessful OAuth response', async () => {
      global.fetch.mockResolvedValue(
        mockResponse(
          { error: 'invalid_client' },
          { status: 401 }
        )
      );

      await expect(
        mpesaService.getAccessToken()
      ).rejects.toThrow(
        'Daraja OAuth failed (HTTP 401).'
      );
    });

    test('rejects an OAuth response without an access token', async () => {
      global.fetch.mockResolvedValue(
        mockResponse({ token_type: 'Bearer' })
      );

      await expect(
        mpesaService.getAccessToken()
      ).rejects.toThrow(
        'Daraja OAuth failed (HTTP 200).'
      );
    });
  });

  describe('STK CheckoutRequestID validation', () => {
    test.each([
      null,
      undefined,
      '',
      12345,
      'invalid-checkout-id',
      'ws_CO_'
    ])('rejects an invalid checkout ID: %s', async (checkoutId) => {
      await expect(
        mpesaService.queryStkPush(checkoutId)
      ).rejects.toThrow(
        'A valid STK CheckoutRequestID is required.'
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('STK Query', () => {
    test('queries Daraja and returns transaction result fields', async () => {
      global.fetch
        .mockResolvedValueOnce(
          mockResponse({
            access_token: 'sandbox-access-token'
          })
        )
        .mockResolvedValueOnce(
          mockResponse({
            ResponseCode: '0',
            ResponseDescription: 'The service request has been accepted successfully.',
            MerchantRequestID: 'merchant-test-123',
            CheckoutRequestID: 'ws_CO_123456789',
            ResultCode: '0',
            ResultDesc: 'The service request is processed successfully.'
          })
        );

      const result = await mpesaService.queryStkPush(
        'ws_CO_123456789'
      );

      expect(result).toEqual({
        responseCode: '0',
        responseDescription:
          'The service request has been accepted successfully.',
        resultCode: '0',
        resultDescription:
          'The service request is processed successfully.',
        checkoutRequestId: 'ws_CO_123456789'
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);

      const [queryUrl, queryOptions] =
        global.fetch.mock.calls[1];

      expect(queryUrl).toBe(
        'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query'
      );

      expect(queryOptions.method).toBe('POST');

      expect(queryOptions.headers.Authorization).toBe(
        'Bearer sandbox-access-token'
      );

      const payload = JSON.parse(queryOptions.body);

      expect(payload.BusinessShortCode).toBe('174379');
      expect(payload.CheckoutRequestID).toBe('ws_CO_123456789');
      expect(payload.Timestamp).toMatch(/^\d{14}$/);
      expect(payload.Password).toBe(
        Buffer.from(
          `174379test-passkey${payload.Timestamp}`
        ).toString('base64')
      );
    });

    test('returns a failed transaction result without treating HTTP 200 as payment success', async () => {
      global.fetch
        .mockResolvedValueOnce(
          mockResponse({
            access_token: 'sandbox-access-token'
          })
        )
        .mockResolvedValueOnce(
          mockResponse({
            ResponseCode: '0',
            ResponseDescription: 'Query accepted.',
            ResultCode: '1032',
            ResultDesc: 'Request cancelled by user.'
          })
        );

      const result = await mpesaService.queryStkPush(
        'ws_CO_123456789'
      );

      expect(result.resultCode).toBe('1032');
      expect(result.resultDescription).toBe(
        'Request cancelled by user.'
      );

      // The service reports the provider result; it does not
      // independently mark invoices or payments as successful.
    });

    test('rejects a non-successful HTTP response', async () => {
      global.fetch
        .mockResolvedValueOnce(
          mockResponse({
            access_token: 'sandbox-access-token'
          })
        )
        .mockResolvedValueOnce(
          mockResponse(
            { errorMessage: 'Request failed' },
            { status: 500 }
          )
        );

      await expect(
        mpesaService.queryStkPush('ws_CO_123456789')
      ).rejects.toThrow(
        'Daraja STK Query failed (HTTP 500).'
      );
    });
    test.each([
      ['null response', null],
      ['array response', []],
      ['missing ResponseCode', {
        ResponseDescription: 'Query accepted.'
      }],
      ['missing ResponseDescription', {
        ResponseCode: '0'
      }]
    ])('rejects malformed query response: %s', async (_label, queryData) => {
      global.fetch
        .mockResolvedValueOnce(
          mockResponse({
            access_token: 'sandbox-access-token'
          })
        )
        .mockResolvedValueOnce(mockResponse(queryData));

      await expect(
        mpesaService.queryStkPush('ws_CO_123456789')
      ).rejects.toThrow(
        'Daraja returned an invalid STK Query response. Reconciliation is required.'
      );
    });
    test('rejects an unreadable query response', async () => {
      global.fetch
        .mockResolvedValueOnce(
          mockResponse({
            access_token: 'sandbox-access-token'
          })
        )
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockRejectedValue(
            new Error('Invalid JSON')
          )
        });

      await expect(
        mpesaService.queryStkPush('ws_CO_123456789')
      ).rejects.toThrow(
        'Daraja returned an unreadable STK Query response. Reconciliation is required.'
      );
    });

    test('propagates a network error from the query request', async () => {
      global.fetch
        .mockResolvedValueOnce(
          mockResponse({
            access_token: 'sandbox-access-token'
          })
        )
        .mockRejectedValueOnce(
          new Error('Network connection failed')
        );

      await expect(
        mpesaService.queryStkPush('ws_CO_123456789')
      ).rejects.toThrow('Network connection failed');
    });
  });
});