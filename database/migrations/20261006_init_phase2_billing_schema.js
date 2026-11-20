/**
 * REYMASS ONE - Phase 2 Billing & Ledger Migration
 */
exports.up = function(knex) {
  return knex.schema
    // 1. Quotations
    .createTable('quotations', (table) => {
      table.increments('id').primary();
      table.string('quotation_number').unique().notNullable(); // e.g. QT-2026-00001
      table.integer('customer_id').unsigned().notNullable().references('id').inTable('customers');
      table.integer('subsidiary_id').unsigned().notNullable().references('id').inTable('subsidiaries');
      table.date('issue_date').notNullable();
      table.date('valid_until').notNullable();
      table.decimal('subtotal', 14, 2).defaultTo(0.00);
      table.decimal('tax_amount', 14, 2).defaultTo(0.00);
      table.decimal('discount_amount', 14, 2).defaultTo(0.00);
      table.decimal('total_amount', 14, 2).notNullable();
      table.string('status').defaultTo('DRAFT'); // DRAFT, SENT, VIEWED, APPROVED, REJECTED, EXPIRED
      table.text('terms');
      table.text('notes');
      table.integer('created_by').unsigned().references('id').inTable('users');
      table.timestamps(true, true);
    })
    // 2. Quotation Items
    .createTable('quotation_items', (table) => {
      table.increments('id').primary();
      table.integer('quotation_id').unsigned().notNullable().references('id').inTable('quotations').onDelete('CASCADE');
      table.string('description').notNullable();
      table.integer('quantity').notNullable().defaultTo(1);
      table.decimal('unit_price', 14, 2).notNullable();
      table.decimal('line_total', 14, 2).notNullable();
    })
    // 3. Invoices
    .createTable('invoices', (table) => {
      table.increments('id').primary();
      table.string('invoice_number').unique().notNullable(); // e.g. INV-2026-00001
      table.integer('quotation_id').unsigned().nullable().references('id').inTable('quotations');
      table.integer('customer_id').unsigned().notNullable().references('id').inTable('customers');
      table.integer('subsidiary_id').unsigned().notNullable().references('id').inTable('subsidiaries');
      table.date('issue_date').notNullable();
      table.date('due_date').notNullable();
      table.decimal('subtotal', 14, 2).defaultTo(0.00);
      table.decimal('tax_amount', 14, 2).defaultTo(0.00);
      table.decimal('total_amount', 14, 2).notNullable();
      table.decimal('amount_paid', 14, 2).defaultTo(0.00);
      table.decimal('balance_due', 14, 2).notNullable();
      table.string('status').defaultTo('UNPAID'); // UNPAID, PARTIALLY_PAID, PAID, OVERDUE, CANCELLED
      table.timestamps(true, true);
    })
    // 4. Invoice Items
    .createTable('invoice_items', (table) => {
      table.increments('id').primary();
      table.integer('invoice_id').unsigned().notNullable().references('id').inTable('invoices').onDelete('CASCADE');
      table.string('description').notNullable();
      table.integer('quantity').notNullable().defaultTo(1);
      table.decimal('unit_price', 14, 2).notNullable();
      table.decimal('line_total', 14, 2).notNullable();
    })
    // 5. Payments Engine
    .createTable('payments', (table) => {
      table.increments('id').primary();
      table.string('payment_reference').unique().notNullable(); // e.g. MPESA Trans ID or RCT-2026-0001
      table.integer('invoice_id').unsigned().notNullable().references('id').inTable('invoices');
      table.integer('customer_id').unsigned().notNullable().references('id').inTable('customers');
      table.integer('subsidiary_id').unsigned().notNullable().references('id').inTable('subsidiaries');
      table.decimal('amount', 14, 2).notNullable();
      table.string('payment_method').notNullable(); // MPESA_STK, MPESA_PAYBILL, BANK, CARD, CASH
      table.string('provider_reference');
      table.string('status').defaultTo('COMPLETED'); // PENDING, COMPLETED, FAILED
      table.timestamp('payment_date').defaultTo(knex.fn.now());
    })
    // 6. Receipts
    .createTable('receipts', (table) => {
      table.increments('id').primary();
      table.string('receipt_number').unique().notNullable(); // e.g. RCT-2026-00001
      table.integer('payment_id').unsigned().notNullable().references('id').inTable('payments');
      table.integer('customer_id').unsigned().notNullable().references('id').inTable('customers');
      table.decimal('amount_paid', 14, 2).notNullable();
      table.decimal('remaining_balance', 14, 2).notNullable();
      table.timestamp('issued_at').defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('receipts')
    .dropTableIfExists('payments')
    .dropTableIfExists('invoice_items')
    .dropTableIfExists('invoices')
    .dropTableIfExists('quotation_items')
    .dropTableIfExists('quotations');
};