require('dotenv').config();

const db = require('../db');
const PaymentService = require('../services/paymentService');

describe('REYMASS ONE - PaymentService', () => {
  let subsidiaryId;
  let customerId;
  let invoiceId;

  beforeAll(async () => {
    await db.migrate.latest();

    const organizationInsert = await db('organizations').insert({
      name: 'REYMASS TEST ORGANIZATION',
      registration_number: 'TEST-ORG-001',
      email: 'org-test@reymass.test'
    });

    const organizationId = Array.isArray(organizationInsert)
      ? organizationInsert[0]
      : organizationInsert;

    const subsidiaryInsert = await db('subsidiaries').insert({
      organization_id: organizationId,
      code: 'TESTTECH',
      name: 'REYMASS Test Tech'
    });

    subsidiaryId = Array.isArray(subsidiaryInsert)
      ? subsidiaryInsert[0]
      : subsidiaryInsert;

    const customerInsert = await db('customers').insert({
      account_number: 'CUST-TEST-00001',
      account_type: 'INDIVIDUAL',
      name: 'Payment Test Customer',
      email: 'payment-test@reymass.test',
      phone: '0700000001',
      primary_subsidiary_id: subsidiaryId,
      status: 'ACTIVE'
    });

    customerId = Array.isArray(customerInsert)
      ? customerInsert[0]
      : customerInsert;
  });

  beforeEach(async () => {
    await db('receipts').del();
    await db('payments').del();
    await db('invoice_items').del();
    await db('invoices').del();
    await db('quotation_items').del();
    await db('quotations').del();

    const invoiceInsert = await db('invoices').insert({
      invoice_number: `INV-TEST-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      customer_id: customerId,
      subsidiary_id: subsidiaryId,
      issue_date: '2026-10-11',
      due_date: '2026-10-30',
      subtotal: 1000,
      tax_amount: 0,
      total_amount: 1000,
      amount_paid: 0,
      balance_due: 1000,
      status: 'UNPAID'
    });

    invoiceId = Array.isArray(invoiceInsert)
      ? invoiceInsert[0]
      : invoiceInsert;
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('records a full payment and generates a receipt', async () => {
    const result = await PaymentService.recordPayment({
      invoiceId,
      amount: 1000,
      paymentMethod: 'CASH',
      transactionRef: 'TEST-FULL-PAYMENT-001'
    });

    expect(result.invoiceStatus).toBe('PAID');
    expect(result.amountPaid).toBe('1000.00');
    expect(result.remainingBalance).toBe('0.00');
    expect(result.receiptNumber).toBeTruthy();

    const invoice = await db('invoices').where({ id: invoiceId }).first();
    const payment = await db('payments')
      .where({ payment_reference: 'TEST-FULL-PAYMENT-001' })
      .first();
    const receipt = await db('receipts')
      .where({ payment_id: result.paymentId })
      .first();

    expect(Number(invoice.amount_paid)).toBe(1000);
    expect(Number(invoice.balance_due)).toBe(0);
    expect(invoice.status).toBe('PAID');
    expect(payment).toBeTruthy();
    expect(receipt).toBeTruthy();
    expect(Number(receipt.amount_paid)).toBe(1000);
    expect(Number(receipt.remaining_balance)).toBe(0);
  });
test('updates only the invoice receiving the payment', async () => {
const secondInvoiceInsert = await db('invoices').insert({
invoice_number: `INV-SECOND-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,
customer_id: customerId,
subsidiary_id: subsidiaryId,
issue_date: '2026-10-11',
due_date: '2026-10-30',
subtotal: 2000,
tax_amount: 0,
total_amount: 2000,
amount_paid: 0,
balance_due: 2000,
status: 'UNPAID'
});

const secondInvoiceId = Array.isArray(secondInvoiceInsert)
  ? secondInvoiceInsert[0]
  : secondInvoiceInsert;

await PaymentService.recordPayment({
  invoiceId,
  amount: 300,
  paymentMethod: 'CASH',
  transactionRef: 'TEST-INVOICE-ISOLATION-001'
});

const firstInvoice = await db('invoices')
  .where({ id: invoiceId })
  .first();

const secondInvoice = await db('invoices')
  .where({ id: secondInvoiceId })
  .first();

expect(Number(firstInvoice.amount_paid)).toBe(300);
expect(Number(firstInvoice.balance_due)).toBe(700);
expect(firstInvoice.status).toBe('PARTIALLY_PAID');

expect(Number(secondInvoice.amount_paid)).toBe(0);
expect(Number(secondInvoice.balance_due)).toBe(2000);
expect(secondInvoice.status).toBe('UNPAID');

});

  test('records a partial payment and preserves the remaining balance', async () => {
    const result = await PaymentService.recordPayment({
      invoiceId,
      amount: 300,
      paymentMethod: 'CASH',
      transactionRef: 'TEST-PARTIAL-PAYMENT-001'
    });

    expect(result.invoiceStatus).toBe('PARTIALLY_PAID');
    expect(result.amountPaid).toBe('300.00');
    expect(result.remainingBalance).toBe('700.00');

    const invoice = await db('invoices').where({ id: invoiceId }).first();

    expect(Number(invoice.amount_paid)).toBe(300);
    expect(Number(invoice.balance_due)).toBe(700);
    expect(invoice.status).toBe('PARTIALLY_PAID');
  });

  test('rejects a payment exceeding the outstanding balance', async () => {
    await expect(
      PaymentService.recordPayment({
        invoiceId,
        amount: 1000.01,
        paymentMethod: 'CASH',
        transactionRef: 'TEST-OVERPAYMENT-001'
      })
    ).rejects.toThrow(/exceeds the outstanding balance/i);

    const invoice = await db('invoices').where({ id: invoiceId }).first();
    const payments = await db('payments').where({ invoice_id: invoiceId });

    expect(Number(invoice.amount_paid)).toBe(0);
    expect(Number(invoice.balance_due)).toBe(1000);
    expect(payments).toHaveLength(0);
  });

  test('rejects a duplicate transaction reference without duplicating payment', async () => {
    const transactionRef = 'TEST-DUPLICATE-001';

    await PaymentService.recordPayment({
      invoiceId,
      amount: 200,
      paymentMethod: 'CASH',
      transactionRef
    });

    await expect(
      PaymentService.recordPayment({
        invoiceId,
        amount: 200,
        paymentMethod: 'CASH',
        transactionRef
      })
    ).rejects.toThrow();

    const payments = await db('payments')
      .where({ payment_reference: transactionRef });
    const receipts = await db('receipts');

    expect(payments).toHaveLength(1);
    expect(receipts).toHaveLength(1);
  });

  test('rejects payment for a nonexistent invoice', async () => {
    await expect(
      PaymentService.recordPayment({
        invoiceId: 999999999,
        amount: 100,
        paymentMethod: 'CASH'
      })
    ).rejects.toThrow(/invoice not found/i);
  });

  test('rejects payment against an already paid invoice', async () => {
    await db('invoices').where({ id: invoiceId }).update({
      amount_paid: 1000,
      balance_due: 0,
      status: 'PAID'
    });

    await expect(
      PaymentService.recordPayment({
        invoiceId,
        amount: 100,
        paymentMethod: 'CASH'
      })
    ).rejects.toThrow(/already fully paid/i);
  });

  test('rejects payment against a cancelled invoice', async () => {
    await db('invoices').where({ id: invoiceId }).update({
      status: 'CANCELLED'
    });

    await expect(
      PaymentService.recordPayment({
        invoiceId,
        amount: 100,
        paymentMethod: 'CASH'
      })
    ).rejects.toThrow(/cancelled invoice/i);
  });

  test('rejects a zero payment', async () => {
    await expect(
      PaymentService.recordPayment({
        invoiceId,
        amount: 0,
        paymentMethod: 'CASH'
      })
    ).rejects.toThrow(/greater than zero/i);
  });

  test('rejects an unsupported payment method', async () => {
    await expect(
      PaymentService.recordPayment({
        invoiceId,
        amount: 100,
        paymentMethod: 'UNSUPPORTED'
      })
    ).rejects.toThrow(/unsupported payment method/i);
  });

  test('rejects an amount with more than two decimal places', async () => {
    await expect(
      PaymentService.recordPayment({
        invoiceId,
        amount: 100.123,
        paymentMethod: 'CASH'
      })
    ).rejects.toThrow(/two decimal places/i);
  });
  test('rolls back payment and invoice changes if receipt creation fails', async () => {
    // Create a temporary trigger that deliberately fails receipt insertion.
    await db.raw(`
      CREATE TRIGGER test_force_receipt_failure
      BEFORE INSERT ON receipts
      BEGIN
        SELECT RAISE(ABORT, 'Injected receipt failure');
      END;
    `);

    try {
      await expect(
        PaymentService.recordPayment({
          invoiceId,
          amount: 300,
          paymentMethod: 'CASH',
          transactionRef: 'TEST-ROLLBACK-001'
        })
      ).rejects.toThrow(/Injected receipt failure/i);

      // The payment insert must have been rolled back.
      const payments = await db('payments')
        .where({ invoice_id: invoiceId });

      expect(payments).toHaveLength(0);

      // No receipt should exist.
      const receipts = await db('receipts');

      expect(receipts).toHaveLength(0);

      // The invoice must remain unchanged.
      const invoice = await db('invoices')
        .where({ id: invoiceId })
        .first();

      expect(Number(invoice.amount_paid)).toBe(0);
      expect(Number(invoice.balance_due)).toBe(1000);
      expect(invoice.status).toBe('UNPAID');
    } finally {
      // Always remove the trigger, even if an assertion fails.
      await db.raw('DROP TRIGGER IF EXISTS test_force_receipt_failure;');
    }
  });
  test('does not allow concurrent payments to overpay an invoice', async () => {
    const results = await Promise.allSettled([
      PaymentService.recordPayment({
        invoiceId,
        amount: 700,
        paymentMethod: 'CASH',
        transactionRef: 'TEST-CONCURRENT-PAYMENT-A'
      }),
      PaymentService.recordPayment({
        invoiceId,
        amount: 700,
        paymentMethod: 'CASH',
        transactionRef: 'TEST-CONCURRENT-PAYMENT-B'
      })
    ]);

    const successfulPayments = results.filter(
      (result) => result.status === 'fulfilled'
    );

    const rejectedPayments = results.filter(
      (result) => result.status === 'rejected'
    );

    const invoice = await db('invoices')
      .where({ id: invoiceId })
      .first();

    const payments = await db('payments')
      .where({ invoice_id: invoiceId });

    const receipts = await db('receipts')
      .whereIn('payment_id', payments.map((payment) => payment.id));

    expect(successfulPayments).toHaveLength(1);
    expect(rejectedPayments).toHaveLength(1);
    expect(payments).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(Number(invoice.amount_paid)).toBe(700);
    expect(Number(invoice.balance_due)).toBe(300);
    expect(invoice.status).toBe('PARTIALLY_PAID');
  });

});
