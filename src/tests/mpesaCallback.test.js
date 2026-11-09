require('dotenv').config();

const request = require('supertest');
const app = require('../app');
const db = require('../db');
const PaymentService = require('../services/paymentService');

describe('REYMASS ONE - M-Pesa STK Callback', () => {
  let organizationId;
  let subsidiaryId;
  let customerId;
  let invoiceId;
  let extraCustomerId;
  let extraSubsidiaryId;
  let checkoutRequestId;
  let merchantRequestId;
  let testSuffix;

  const getInsertedId = (result) =>
    Array.isArray(result) ? result[0] : result;

  const callbackPayload = ({
    resultCode = 0,
    amount = 100,
    receipt = `RY${Date.now()}${Math.floor(Math.random() * 100000)}`,
    phone = 254712345678,
    checkoutId = checkoutRequestId,
    merchantId = merchantRequestId
  } = {}) => ({
    Body: {
      stkCallback: {
        MerchantRequestID: merchantId,
        CheckoutRequestID: checkoutId,
        ResultCode: resultCode,
        ResultDesc:
          resultCode === 0
            ? 'The service request is processed successfully.'
            : 'The request was cancelled or failed.',
        ...(resultCode === 0
          ? {
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: amount },
                  { Name: 'MpesaReceiptNumber', Value: receipt },
                  { Name: 'PhoneNumber', Value: phone }
                ]
              }
            }
          : {})
      }
    }
  });

  beforeAll(async () => {
    await db.migrate.latest();

    testSuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const organizationResult = await db('organizations').insert({
      name: `M-PESA CALLBACK TEST ${testSuffix}`,
      registration_number: `MPESA-TEST-${testSuffix}`,
      email: `mpesa-org-${testSuffix}@reymass.test`
    });

    organizationId = getInsertedId(organizationResult);

    const subsidiaryResult = await db('subsidiaries').insert({
      organization_id: organizationId,
      code: `MP${Date.now().toString().slice(-6)}`,
      name: `REYMASS Callback Test ${testSuffix}`
    });

    subsidiaryId = getInsertedId(subsidiaryResult);

    const customerResult = await db('customers').insert({
      account_number: `MC${testSuffix}`.slice(0, 30),
      account_type: 'INDIVIDUAL',
      name: `M-Pesa Callback Test Customer ${testSuffix}`,
      email: `mpesa-customer-${testSuffix}@reymass.test`,
      phone: '0712345678',
      primary_subsidiary_id: subsidiaryId,
      status: 'ACTIVE'
    });

    customerId = getInsertedId(customerResult);
  });

  beforeEach(async () => {
    const suffix =
      `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    const invoiceResult = await db('invoices').insert({
      invoice_number: `MPESA-TEST-${suffix}`,
      customer_id: customerId,
      subsidiary_id: subsidiaryId,
      issue_date: '2026-10-12',
      due_date: '2026-11-12',
      subtotal: 100,
      tax_amount: 0,
      total_amount: 100,
      amount_paid: 0,
      balance_due: 100,
      status: 'UNPAID'
    });

    invoiceId = getInsertedId(invoiceResult);

    checkoutRequestId = `ws_CO_${suffix}`;
    merchantRequestId = `ws_MR_${suffix}`;

    await db('mpesa_stk_requests').insert({
      invoice_id: invoiceId,
      customer_id: customerId,
      merchant_request_id: merchantRequestId,
      checkout_request_id: checkoutRequestId,
      phone_number: '0712345678',
      amount: 100,
      account_reference: `TEST-${suffix}`,
      status: 'PENDING'
    });
  });

  afterEach(async () => {
    if (invoiceId) {
      const paymentRows = await db('payments')
        .where({ invoice_id: invoiceId })
        .select('id');

      const paymentIds = paymentRows.map((row) => row.id);

      if (paymentIds.length) {
        await db('receipts')
          .whereIn('payment_id', paymentIds)
          .del();
      }

      await db('payments')
        .where({ invoice_id: invoiceId })
        .del();

await db('mpesa_stk_requests')
  .where({ invoice_id: invoiceId })
  .del();

      await db('invoices')
        .where({ id: invoiceId })
        .del();
    }
if (extraCustomerId) {
  await db('customers')
    .where({ id: extraCustomerId })
    .del();
}

if (extraSubsidiaryId) {
  await db('subsidiaries')
    .where({ id: extraSubsidiaryId })
    .del();
}

extraCustomerId = undefined;
extraSubsidiaryId = undefined;
    invoiceId = undefined;
    checkoutRequestId = undefined;
    merchantRequestId = undefined;
  });

  afterAll(async () => {
    if (customerId) {
      await db('customers').where({ id: customerId }).del();
    }

    if (subsidiaryId) {
      await db('subsidiaries').where({ id: subsidiaryId }).del();
    }

    if (organizationId) {
      await db('organizations').where({ id: organizationId }).del();
    }

    await db.destroy();
  });

  test('records a valid successful callback exactly once', async () => {
    const payload = callbackPayload();
const expectedReceipt =
  payload.Body.stkCallback.CallbackMetadata.Item[1].Value;
    const response = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(payload);

    expect(response.status).toBe(200);

    const invoice = await db('invoices')
      .where({ id: invoiceId })
      .first();

    const stkRequest = await db('mpesa_stk_requests')
      .where({ checkout_request_id: checkoutRequestId })
      .first();

    const payments = await db('payments')
      .where({ invoice_id: invoiceId });

    const receipts = await db('receipts')
      .whereIn('payment_id', payments.map((payment) => payment.id));

    expect(stkRequest.status).toBe('SUCCESS');
    expect(payments).toHaveLength(1);
    expect(payments[0].provider_reference).toBe(expectedReceipt);
    expect(receipts).toHaveLength(1);
    expect(Number(invoice.amount_paid)).toBe(100);
    expect(Number(invoice.balance_due)).toBe(0);
    expect(invoice.status).toBe('PAID');
    expect(payments[0].provider_reference).toBe(
      payload.Body.stkCallback.CallbackMetadata.Item[1].Value
    );
  });

  test('does not create duplicate payments when the callback is repeated', async () => {
    const payload = callbackPayload();

    const firstResponse = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(payload);

    const secondResponse = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(payload);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const payments = await db('payments')
      .where({ invoice_id: invoiceId });

    const receipts = await db('receipts')
      .whereIn('payment_id', payments.map((payment) => payment.id));

    const invoice = await db('invoices')
      .where({ id: invoiceId })
      .first();

    expect(payments).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(Number(invoice.amount_paid)).toBe(100);
    expect(Number(invoice.balance_due)).toBe(0);
  });

  test('does not update the invoice when the customer cancels the STK request', async () => {
    const response = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(callbackPayload({ resultCode: 1032 }));

    expect(response.status).toBe(200);

    const invoice = await db('invoices')
      .where({ id: invoiceId })
      .first();

    const stkRequest = await db('mpesa_stk_requests')
      .where({ checkout_request_id: checkoutRequestId })
      .first();

    const payments = await db('payments')
      .where({ invoice_id: invoiceId });

    expect(stkRequest.status).toBe('CANCELLED');
    expect(payments).toHaveLength(0);
    expect(Number(invoice.amount_paid)).toBe(0);
    expect(Number(invoice.balance_due)).toBe(100);
    expect(invoice.status).toBe('UNPAID');
  });

  test('rejects a successful callback with an incorrect amount', async () => {
    const response = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(callbackPayload({ amount: 50 }));

    expect(response.status).toBe(200);

    const invoice = await db('invoices')
      .where({ id: invoiceId })
      .first();

    const stkRequest = await db('mpesa_stk_requests')
      .where({ checkout_request_id: checkoutRequestId })
      .first();

    const payments = await db('payments')
      .where({ invoice_id: invoiceId });

    expect(stkRequest.status).toBe('FAILED');
    expect(payments).toHaveLength(0);
    expect(Number(invoice.amount_paid)).toBe(0);
    expect(Number(invoice.balance_due)).toBe(100);
    expect(invoice.status).toBe('UNPAID');
  });

  test('rejects a successful callback with an incorrect phone number', async () => {
    const response = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(callbackPayload({ phone: 254799999999 }));

    expect(response.status).toBe(200);

    const invoice = await db('invoices')
      .where({ id: invoiceId })
      .first();

    const stkRequest = await db('mpesa_stk_requests')
      .where({ checkout_request_id: checkoutRequestId })
      .first();

    const payments = await db('payments')
      .where({ invoice_id: invoiceId });

        expect(stkRequest.status).toBe('FAILED');
    expect(payments).toHaveLength(0);
    expect(Number(invoice.amount_paid)).toBe(0);
    expect(Number(invoice.balance_due)).toBe(100);
  });
test('recovers a reconciliation-required request without duplicating payment', async () => {
  await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .update({
      status: 'RECONCILIATION_REQUIRED'
    });

  const response = await request(app)
    .post('/api/v1/mpesa/callback')
    .send(callbackPayload());

  expect(response.status).toBe(200);

  const stkRequest = await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .first();

  const invoice = await db('invoices')
    .where({ id: invoiceId })
    .first();

  const payments = await db('payments')
    .where({ invoice_id: invoiceId });

  const receipts = await db('receipts')
    .whereIn(
      'payment_id',
      payments.map((payment) => payment.id)
    );

  expect(stkRequest.status).toBe('SUCCESS');
  expect(payments).toHaveLength(1);
  expect(receipts).toHaveLength(1);
  expect(Number(invoice.amount_paid)).toBe(100);
  expect(Number(invoice.balance_due)).toBe(0);
  expect(invoice.status).toBe('PAID');

  // A repeated callback must not create another payment.
  await request(app)
    .post('/api/v1/mpesa/callback')
    .send(callbackPayload());

  const paymentsAfterRetry = await db('payments')
    .where({ invoice_id: invoiceId });

  const receiptsAfterRetry = await db('receipts')
    .whereIn(
      'payment_id',
      paymentsAfterRetry.map((payment) => payment.id)
    );

  expect(paymentsAfterRetry).toHaveLength(1);
  expect(receiptsAfterRetry).toHaveLength(1);
});
test('records a cancellation callback for a reconciliation-required request without creating a payment', async () => {
await db('mpesa_stk_requests')
.where({ checkout_request_id: checkoutRequestId })
.update({ status: 'RECONCILIATION_REQUIRED' });

const response = await request(app)
.post('/api/v1/mpesa/callback')
.send(callbackPayload({ resultCode: 1032 }));

expect(response.status).toBe(200);

const stkRequest = await db('mpesa_stk_requests')
.where({ checkout_request_id: checkoutRequestId })
.first();

const payments = await db('payments')
.where({ invoice_id: invoiceId });

const receipts = await db('receipts')
.where({ customer_id: customerId });

const invoice = await db('invoices')
.where({ id: invoiceId })
.first();

expect(stkRequest.status).toBe('CANCELLED');
expect(payments).toHaveLength(0);
expect(receipts).toHaveLength(0);
expect(Number(invoice.amount_paid)).toBe(0);
expect(Number(invoice.balance_due)).toBe(100);
expect(invoice.status).toBe('UNPAID');
});
test('recovers when payment recording succeeds but finalization fails', async () => {
  const payload = callbackPayload();
const expectedReceipt =
 payload.Body.stkCallback.CallbackMetadata.Item[1].Value;
  const receiptNumber =
    payload.Body.stkCallback.CallbackMetadata.Item[1].Value;

  const stkRequest = await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .first();

  expect(stkRequest).toBeTruthy();

  const originalQuery = db.client._query;
  let injectedFailure = false;

  db.client._query = function (connection, obj) {
    const sql = obj && obj.sql ? obj.sql.toLowerCase() : '';
    const bindings = obj && obj.bindings;

   
    const isFinalizationUpdate =
      !injectedFailure &&
      sql.startsWith('update `mpesa_stk_requests`') &&
      Array.isArray(bindings) &&
      bindings[0] === 'SUCCESS' &&
      Number(bindings[bindings.length - 1]) === Number(stkRequest.id);

    if (isFinalizationUpdate) {
      injectedFailure = true;
      return Promise.reject(
        new Error('Injected one-time finalization failure')
      );
    }

    return originalQuery.call(this, connection, obj);
  };

  let firstResponse;

  try {
    firstResponse = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(payload);
  } finally {
    db.client._query = originalQuery;
  }

  expect(injectedFailure).toBe(true);
  expect(firstResponse.status).toBe(200);

  let updatedRequest = await db('mpesa_stk_requests')
    .where({ id: stkRequest.id })
    .first();

  let payments = await db('payments')
    .where({ invoice_id: invoiceId });

  let receipts = await db('receipts')
    .whereIn('payment_id', payments.map((payment) => payment.id));

  let invoice = await db('invoices')
    .where({ id: invoiceId })
    .first();

  expect(updatedRequest.status).toBe('RECONCILIATION_REQUIRED');
  expect(payments).toHaveLength(1);
  expect(receipts).toHaveLength(1);
  expect(receipts[0].receipt_number).toMatch(/^RCT-/);
  expect(Number(invoice.amount_paid)).toBe(100);
  expect(Number(invoice.balance_due)).toBe(0);
  expect(invoice.status).toBe('PAID');

  const retryResponse = await request(app)
    .post('/api/v1/mpesa/callback')
    .send(payload);

  expect(retryResponse.status).toBe(200);

  updatedRequest = await db('mpesa_stk_requests')
    .where({ id: stkRequest.id })
    .first();

  payments = await db('payments')
    .where({ invoice_id: invoiceId });

  receipts = await db('receipts')
    .whereIn('payment_id', payments.map((payment) => payment.id));

  invoice = await db('invoices')
    .where({ id: invoiceId })
    .first();

  expect(updatedRequest.status).toBe('SUCCESS');
  expect(updatedRequest.mpesa_receipt_number).toBe(receiptNumber);
  expect(payments).toHaveLength(1);
  expect(receipts).toHaveLength(1);
  expect(Number(invoice.amount_paid)).toBe(100);
  expect(Number(invoice.balance_due)).toBe(0);
  expect(invoice.status).toBe('PAID');
});
test('recovers a committed payment when both finalization updates fail', async () => {
  const payload = callbackPayload();

  const receiptNumber =
    payload.Body.stkCallback.CallbackMetadata.Item[1].Value;

  const stkRequest = await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .first();

  const originalQuery = db.client._query;
  let successUpdateFailed = false;
  let reconciliationUpdateFailed = false;

  db.client._query = function (connection, obj) {
    const sql = obj && obj.sql
      ? obj.sql.toLowerCase()
      : '';

    const bindings = obj && obj.bindings;

    const isTargetUpdate =
      sql.startsWith('update `mpesa_stk_requests`') &&
      Array.isArray(bindings) &&
      Number(bindings[bindings.length - 1]) ===
        Number(stkRequest.id);

    if (
      isTargetUpdate &&
      !successUpdateFailed &&
      bindings[0] === 'SUCCESS'
    ) {
      successUpdateFailed = true;

      return Promise.reject(
        new Error('Injected SUCCESS update failure')
      );
    }

    if (
      isTargetUpdate &&
      successUpdateFailed &&
      !reconciliationUpdateFailed &&
      bindings[0] === 'RECONCILIATION_REQUIRED'
    ) {
      reconciliationUpdateFailed = true;

      return Promise.reject(
        new Error('Injected reconciliation update failure')
      );
    }

    return originalQuery.call(this, connection, obj);
  };

  let firstResponse;

  try {
    firstResponse = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(payload);
  } finally {
    db.client._query = originalQuery;
  }

  expect(successUpdateFailed).toBe(true);
  expect(reconciliationUpdateFailed).toBe(true);
  expect(firstResponse.status).toBe(200);

  let updatedRequest = await db('mpesa_stk_requests')
    .where({ id: stkRequest.id })
    .first();

  let payments = await db('payments')
    .where({ invoice_id: invoiceId });

  let receipts = await db('receipts')
    .whereIn('payment_id', payments.map((payment) => payment.id));

  let invoice = await db('invoices')
    .where({ id: invoiceId })
    .first();

  expect(updatedRequest.status).toBe('PROCESSING');
  expect(payments).toHaveLength(1);
  expect(receipts).toHaveLength(1);
  expect(Number(invoice.amount_paid)).toBe(100);
  expect(Number(invoice.balance_due)).toBe(0);
  expect(invoice.status).toBe('PAID');

  const retryResponse = await request(app)
    .post('/api/v1/mpesa/callback')
    .send(payload);

  expect(retryResponse.status).toBe(200);

  updatedRequest = await db('mpesa_stk_requests')
    .where({ id: stkRequest.id })
    .first();

  payments = await db('payments')
    .where({ invoice_id: invoiceId });

  receipts = await db('receipts')
    .whereIn('payment_id', payments.map((payment) => payment.id));

  invoice = await db('invoices')
    .where({ id: invoiceId })
    .first();

  expect(updatedRequest.status).toBe('SUCCESS');
  expect(updatedRequest.mpesa_receipt_number).toBe(receiptNumber);
  expect(payments).toHaveLength(1);
  expect(receipts).toHaveLength(1);
  expect(Number(invoice.amount_paid)).toBe(100);
  expect(Number(invoice.balance_due)).toBe(0);
  expect(invoice.status).toBe('PAID');
});
test('preserves payment integrity when recording and reconciliation updates fail', async () => {
  const payload = callbackPayload();

  const receiptNumber =
    payload.Body.stkCallback.CallbackMetadata.Item[1].Value;

  const stkRequest = await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .first();

  const originalQuery = db.client._query;

  let paymentRecordingFailed = false;
  let reconciliationUpdateFailed = false;

  const recordPaymentSpy = jest
    .spyOn(PaymentService, 'recordPayment')
    .mockImplementation(async () => {
      paymentRecordingFailed = true;

      throw new Error('Injected payment-recording failure');
    });

  db.client._query = function (connection, obj) {
    const sql = obj && obj.sql
      ? obj.sql.toLowerCase()
      : '';

    const bindings = obj && obj.bindings;

    const isReconciliationUpdate =
      paymentRecordingFailed &&
      !reconciliationUpdateFailed &&
      sql.startsWith('update `mpesa_stk_requests`') &&
      Array.isArray(bindings) &&
      bindings[0] === 'RECONCILIATION_REQUIRED' &&
      Number(bindings[bindings.length - 1]) ===
        Number(stkRequest.id);

    if (isReconciliationUpdate) {
      reconciliationUpdateFailed = true;

      return Promise.reject(
        new Error('Injected reconciliation-update failure')
      );
    }

    return originalQuery.call(this, connection, obj);
  };

  let response;

  try {
    response = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(payload);
  } finally {
    db.client._query = originalQuery;
    recordPaymentSpy.mockRestore();
  }

  expect(paymentRecordingFailed).toBe(true);
  expect(reconciliationUpdateFailed).toBe(true);
  expect(response.status).toBe(200);

  const updatedRequest = await db('mpesa_stk_requests')
    .where({ id: stkRequest.id })
    .first();

  const payments = await db('payments')
    .where({ invoice_id: invoiceId });

  const receipts = await db('receipts')
    .whereIn('payment_id', payments.map((payment) => payment.id));

  const invoice = await db('invoices')
    .where({ id: invoiceId })
    .first();

  expect(updatedRequest.status).toBe('PROCESSING');
  expect(updatedRequest.mpesa_receipt_number).toBe(receiptNumber);
  expect(payments).toHaveLength(0);
  expect(receipts).toHaveLength(0);
  expect(Number(invoice.amount_paid)).toBe(0);
  expect(Number(invoice.balance_due)).toBe(100);
  expect(invoice.status).toBe('UNPAID');
});

test('recovers when payment recording commits but returns an error', async () => {
  const payload = callbackPayload();

  const receiptNumber =
    payload.Body.stkCallback.CallbackMetadata.Item[1].Value;

  const stkRequest = await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .first();

  const originalRecordPayment = PaymentService.recordPayment;

  const recordPaymentSpy = jest
    .spyOn(PaymentService, 'recordPayment')
    .mockImplementation(async (paymentData) => {
      // Commit the payment, invoice update, and receipt using
      // the real service, then simulate lost confirmation.
      await originalRecordPayment.call(
        PaymentService,
        paymentData
      );

      throw new Error(
        'Simulated lost confirmation after payment commit'
      );
    });

  let firstResponse;

  try {
    firstResponse = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(payload);
  } finally {
    recordPaymentSpy.mockRestore();
  }

  expect(firstResponse.status).toBe(200);

  let updatedRequest = await db('mpesa_stk_requests')
    .where({ id: stkRequest.id })
    .first();

  let payments = await db('payments')
    .where({ invoice_id: invoiceId });

  let receipts = await db('receipts')
    .whereIn(
      'payment_id',
      payments.map((payment) => payment.id)
    );

  let invoice = await db('invoices')
    .where({ id: invoiceId })
    .first();

  expect(updatedRequest.status).toBe('RECONCILIATION_REQUIRED');
  expect(updatedRequest.mpesa_receipt_number).toBe(receiptNumber);
  expect(payments).toHaveLength(1);
  expect(receipts).toHaveLength(1);
  expect(Number(invoice.amount_paid)).toBe(100);
  expect(Number(invoice.balance_due)).toBe(0);
  expect(invoice.status).toBe('PAID');

  const retryResponse = await request(app)
    .post('/api/v1/mpesa/callback')
    .send(payload);

  expect(retryResponse.status).toBe(200);

  updatedRequest = await db('mpesa_stk_requests')
    .where({ id: stkRequest.id })
    .first();

  payments = await db('payments')
    .where({ invoice_id: invoiceId });

  receipts = await db('receipts')
    .whereIn(
      'payment_id',
      payments.map((payment) => payment.id)
    );

  invoice = await db('invoices')
    .where({ id: invoiceId })
    .first();

  expect(updatedRequest.status).toBe('SUCCESS');
  expect(updatedRequest.mpesa_receipt_number).toBe(receiptNumber);
  expect(payments).toHaveLength(1);
  expect(receipts).toHaveLength(1);
  expect(Number(invoice.amount_paid)).toBe(100);
  expect(Number(invoice.balance_due)).toBe(0);
  expect(invoice.status).toBe('PAID');
});

test('reconciles an existing matching payment without recording it twice', async () => {
  const payload = callbackPayload();
  const receipt =
    payload.Body.stkCallback.CallbackMetadata.Item[1].Value;

  // Simulate payment recording succeeding before request finalization.
  await PaymentService.recordPayment({
    invoiceId,
    amount: 100,
    paymentMethod: 'MPESA_STK',
    transactionRef: receipt
  });

  await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .update({ status: 'PROCESSING' });

  const response = await request(app)
    .post('/api/v1/mpesa/callback')
    .send(payload);

  expect(response.status).toBe(200);

  const stkRequest = await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .first();

  const payments = await db('payments')
    .where({ invoice_id: invoiceId });

  const receipts = await db('receipts')
    .whereIn('payment_id', payments.map((payment) => payment.id));

  const invoice = await db('invoices')
    .where({ id: invoiceId })
    .first();

  expect(stkRequest.status).toBe('SUCCESS');
  expect(payments).toHaveLength(1);
  expect(receipts).toHaveLength(1);
  expect(Number(invoice.amount_paid)).toBe(100);
  expect(Number(invoice.balance_due)).toBe(0);
  expect(invoice.status).toBe('PAID');
});
test('requires reconciliation when an existing payment has no receipt', async () => {
const payload = callbackPayload();
const receipt =
payload.Body.stkCallback.CallbackMetadata.Item[1].Value;

// Simulate payment recording succeeding before request finalization.
await PaymentService.recordPayment({
invoiceId,
amount: 100,
paymentMethod: 'MPESA_STK',
transactionRef: receipt
});

const payment = await db('payments')
.where({ provider_reference: receipt })
.first();

expect(payment).toBeTruthy();

// Simulate an inconsistent record: payment exists, receipt is missing.
await db('receipts')
.where({ payment_id: payment.id })
.del();

await db('mpesa_stk_requests')
.where({ checkout_request_id: checkoutRequestId })
.update({ status: 'PROCESSING' });

const response = await request(app)
.post('/api/v1/mpesa/callback')
.send(payload);

expect(response.status).toBe(200);

const stkRequest = await db('mpesa_stk_requests')
.where({ checkout_request_id: checkoutRequestId })
.first();

const payments = await db('payments')
.where({ invoice_id: invoiceId });

const receipts = await db('receipts')
.where({ payment_id: payment.id });

const invoice = await db('invoices')
.where({ id: invoiceId })
.first();

expect(stkRequest.status).toBe('RECONCILIATION_REQUIRED');
expect(payments).toHaveLength(1);
expect(receipts).toHaveLength(0);
expect(Number(invoice.amount_paid)).toBe(100);
expect(Number(invoice.balance_due)).toBe(0);
expect(invoice.status).toBe('PAID');
});
test('flags an existing payment belonging to another customer for reconciliation', async () => {
  const payload = callbackPayload();
  const receipt =
    payload.Body.stkCallback.CallbackMetadata.Item[1].Value;

  // Create a second valid customer.
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

  const customerResult = await db('customers').insert({
    account_number: `MCX${suffix}`.slice(0, 30),
    account_type: 'INDIVIDUAL',
    name: `Alternate Callback Customer ${suffix}`,
    email: `alternate-${suffix}@reymass.test`,
    phone: '0712345679',
    primary_subsidiary_id: subsidiaryId,
    status: 'ACTIVE'
  });

  extraCustomerId = Array.isArray(customerResult)
    ? customerResult[0]
    : customerResult;

  // Record the legitimate payment against the original invoice.
  await PaymentService.recordPayment({
    invoiceId,
    amount: 100,
    paymentMethod: 'MPESA_STK',
    transactionRef: receipt
  });

  // Simulate inconsistent payment ownership in the database.
  await db('payments')
    .where({ provider_reference: String(receipt) })
    .update({ customer_id: extraCustomerId });

  await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .update({ status: 'PROCESSING' });

  const response = await request(app)
    .post('/api/v1/mpesa/callback')
    .send(payload);

  expect(response.status).toBe(200);
  expect(response.body.ResultDesc).toContain('reconciliation');

  const stkRequest = await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .first();

  const payments = await db('payments')
    .where({ invoice_id: invoiceId });

  const receipts = await db('receipts')
    .whereIn(
      'payment_id',
      payments.map((payment) => payment.id)
    );

  expect(stkRequest.status).toBe('RECONCILIATION_REQUIRED');
  expect(payments).toHaveLength(1);
  expect(receipts).toHaveLength(1);
});
test('flags an existing payment belonging to another subsidiary for reconciliation', async () => {
  const payload = callbackPayload();
  const receipt =
    payload.Body.stkCallback.CallbackMetadata.Item[1].Value;

  // Create a second valid subsidiary.
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

  const subsidiaryResult = await db('subsidiaries').insert({
    organization_id: organizationId,
    code: `MX${suffix}`.slice(0, 20),
    name: `Alternate Callback Subsidiary ${suffix}`
  });

  extraSubsidiaryId = Array.isArray(subsidiaryResult)
    ? subsidiaryResult[0]
    : subsidiaryResult;

  // Record the legitimate payment against the original invoice.
  await PaymentService.recordPayment({
    invoiceId,
    amount: 100,
    paymentMethod: 'MPESA_STK',
    transactionRef: receipt
  });

  // Simulate a payment assigned to the wrong subsidiary.
  await db('payments')
    .where({ provider_reference: String(receipt) })
    .update({ subsidiary_id: extraSubsidiaryId });

  await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .update({ status: 'PROCESSING' });

  const response = await request(app)
    .post('/api/v1/mpesa/callback')
    .send(payload);

  expect(response.status).toBe(200);
  expect(response.body.ResultDesc).toContain('reconciliation');

  const stkRequest = await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .first();

  const payments = await db('payments')
    .where({ invoice_id: invoiceId });

  const receipts = await db('receipts')
    .whereIn(
      'payment_id',
      payments.map((payment) => payment.id)
    );

  expect(stkRequest.status).toBe('RECONCILIATION_REQUIRED');
  expect(payments).toHaveLength(1);
  expect(receipts).toHaveLength(1);
});
  test('flags an existing payment with conflicting details for reconciliation', async () => {
  const payload = callbackPayload();
  const receipt =
    payload.Body.stkCallback.CallbackMetadata.Item[1].Value;

  // Record a KES 50 payment using the same provider reference.
  await PaymentService.recordPayment({
    invoiceId,
    amount: 50,
    paymentMethod: 'MPESA_STK',
    transactionRef: receipt
  });

  await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .update({ status: 'PROCESSING' });

  // The callback reports KES 100, which conflicts with the recorded KES 50.
  const response = await request(app)
    .post('/api/v1/mpesa/callback')
    .send(payload);

  expect(response.status).toBe(200);

  const stkRequest = await db('mpesa_stk_requests')
    .where({ checkout_request_id: checkoutRequestId })
    .first();

  const payments = await db('payments')
    .where({ invoice_id: invoiceId });

  const receipts = await db('receipts')
    .whereIn('payment_id', payments.map((payment) => payment.id));

  const invoice = await db('invoices')
    .where({ id: invoiceId })
    .first();

  expect(stkRequest.status).toBe('RECONCILIATION_REQUIRED');
  expect(payments).toHaveLength(1);
  expect(receipts).toHaveLength(1);
  expect(Number(invoice.amount_paid)).toBe(50);
  expect(Number(invoice.balance_due)).toBe(50);
  expect(invoice.status).toBe('PARTIALLY_PAID');
});
test('processes simultaneous duplicate callbacks only once', async () => {
    const payload = callbackPayload();
const expectedReceipt =
  payload.Body.stkCallback.CallbackMetadata.Item[1].Value;
    const responses = await Promise.all([
      request(app)
        .post('/api/v1/mpesa/callback')
        .send(payload),
      request(app)
        .post('/api/v1/mpesa/callback')
        .send(payload)
    ]);

    expect(responses.every((res) => res.status === 200)).toBe(true);

    const invoice = await db('invoices')
      .where({ id: invoiceId })
      .first();

    const stkRequest = await db('mpesa_stk_requests')
      .where({ checkout_request_id: checkoutRequestId })
      .first();

    const payments = await db('payments')
      .where({ invoice_id: invoiceId });

    const receipts = await db('receipts')
      .whereIn(
        'payment_id',
        payments.map((payment) => payment.id)
      );

    expect(stkRequest.status).toBe('SUCCESS');
    expect(payments).toHaveLength(1);
    expect(payments[0].provider_reference).toBe(expectedReceipt);
    expect(receipts).toHaveLength(1);
    expect(Number(invoice.amount_paid)).toBe(100);
    expect(Number(invoice.balance_due)).toBe(0);
    expect(invoice.status).toBe('PAID');
  });
});