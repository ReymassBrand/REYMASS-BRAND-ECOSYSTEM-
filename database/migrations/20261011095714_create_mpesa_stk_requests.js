/**
 * REYMASS ONE - M-Pesa STK Push Tracking
 */

exports.up = function (knex) {
  return knex.schema.createTable('mpesa_stk_requests', (table) => {
    table.increments('id').primary();

    // Link the request to the REYMASS invoice and customer.
    table.integer('invoice_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('invoices');

    table.integer('customer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('customers');

    // Safaricom request identifiers.
    table.string('merchant_request_id').nullable();
    table.string('checkout_request_id').nullable().unique();

    // Payment request details.
    table.string('phone_number').notNullable();
    table.decimal('amount', 14, 2).notNullable();
    table.string('account_reference').notNullable();

    // Track the request lifecycle.
    table.string('status').notNullable().defaultTo('PENDING');
    // PENDING, SUCCESS, FAILED, CANCELLED

    table.string('result_code').nullable();
    table.text('result_description').nullable();

    // M-Pesa receipt number, populated after successful confirmation.
    table.string('mpesa_receipt_number').nullable().unique();

    table.timestamp('callback_received_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['invoice_id', 'status']);
    table.index(['customer_id', 'created_at']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('mpesa_stk_requests');
};