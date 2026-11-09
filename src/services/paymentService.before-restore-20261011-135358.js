const db = require('../db');

class PaymentService {
  static async recordPayment({
    invoiceId,
    amount,
    paymentMethod,
    transactionRef
  }) {
    const numericInvoiceId = Number(invoiceId);
    const numericAmount = Number(amount);

    if (!Number.isInteger(numericInvoiceId) || numericInvoiceId <= 0) {
      throw new Error('A valid invoice ID is required.');
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const amountInCents = Math.round(numericAmount * 100);

    if (Math.abs(numericAmount * 100 - amountInCents) > 0.000001) {
      throw new Error('Payment cannot have more than two decimal places.');
    }

    const method = String(paymentMethod || 'MPESA_STK')
      .trim()
      .toUpperCase();

    const allowedMethods = [
      'MPESA_STK',
      'MPESA_PAYBILL',
      'BANK',
      'CARD',
      'CASH'
    ];

    if (!allowedMethods.includes(method)) {
      throw new Error('Unsupported payment method.');
    }

    const providerRef = transactionRef
      ? String(transactionRef).trim()
      : null;

    if (transactionRef && !providerRef) {
      throw new Error('Transaction reference cannot be empty.');
    }
return db.transaction(async (trx) => {
  // Prevent a transaction reference from being recorded twice.
  if (providerRef) {
    const existingPayment = await trx('payments')
      .where('provider_reference', providerRef)
      .orWhere('payment_reference', providerRef)
      .first();

    if (existingPayment) {
      throw new Error(
        'This transaction reference has already been recorded.'
      );
    }
  }

  const invoice = await trx('invoices')
    .where({ id: numericInvoiceId })
    .first();
    

      if (!invoice) {
        throw new Error('Invoice not found.');
      }

      if (invoice.status === 'PAID') {
        throw new Error('Invoice is already fully paid.');
      }

      if (invoice.status === 'CANCELLED') {
        throw new Error('Payments cannot be recorded against a cancelled invoice.');
      }

      const totalCents = Math.round(Number(invoice.total_amount) * 100);
      const paidCents = Math.round(Number(invoice.amount_paid || 0) * 100);
      const balanceCents = invoice.balance_due != null
  ? Math.round(Number(invoice.balance_due) * 100)
  : totalCents - paidCents;

      if (
        !Number.isFinite(totalCents) ||
        !Number.isFinite(paidCents) ||
        !Number.isFinite(balanceCents) ||
        totalCents <= 0 ||
        balanceCents <= 0
      ) {
        throw new Error('Invoice amounts are invalid or no balance is outstanding.');
      }

      if (amountInCents > balanceCents) {
        throw new Error(
          `Payment exceeds the outstanding balance of KES ${(balanceCents / 100).toFixed(2)}.`
        );
      }

      const newPaidCents = paidCents + amountInCents;
      const newBalanceCents = balanceCents - amountInCents;

      const newStatus = newBalanceCents === 0
        ? 'PAID'
        : 'PARTIALLY_PAID';

      const paymentReference = providerRef ||
        `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      const paymentInsert = await trx('payments').insert({
        payment_reference: paymentReference,
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        subsidiary_id: invoice.subsidiary_id,
        amount: (amountInCents / 100).toFixed(2),
        payment_method: method,
        provider_reference: providerRef,
        status: 'COMPLETED'
      });

      const paymentId = Array.isArray(paymentInsert)
        ? paymentInsert[0]
        : paymentInsert;

      if (!paymentId) {
        throw new Error('Could not obtain the payment ID.');
      }

      await trx('invoices')
        .where({ id: invoice.id })
        .update({
          amount_paid: (newPaidCents / 100).toFixed(2),
          balance_due: (newBalanceCents / 100).toFixed(2),
          status: newStatus,
          updated_at: trx.fn.now()
        });

      const currentYear = new Date().getFullYear();
      const receiptNumber =
        `RCT-${currentYear}-${String(paymentId).padStart(5, '0')}`;

      await trx('receipts').insert({
        receipt_number: receiptNumber,
        payment_id: paymentId,
        customer_id: invoice.customer_id,
        amount_paid: (amountInCents / 100).toFixed(2),
        remaining_balance: (newBalanceCents / 100).toFixed(2)
      });

      return {
        paymentId,
        paymentReference,
        receiptNumber,
        invoiceId: invoice.id,
        invoiceStatus: newStatus,
        amountPaid: (amountInCents / 100).toFixed(2),
        remainingBalance: (newBalanceCents / 100).toFixed(2)
      };
    });
  }
}

module.exports = PaymentService;


