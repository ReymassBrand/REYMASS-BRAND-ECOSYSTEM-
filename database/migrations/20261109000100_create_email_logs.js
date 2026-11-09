/**
 * REYMASS ONE
 * Email Delivery & Notification Audit Log
 *
 * Tracks outgoing email notifications and provider delivery events.
 */

exports.up = function (knex) {
  return knex.schema.createTable('email_logs', (table) => {
    table.increments('id').primary();

    // Email details
    table.string('recipient', 255).notNullable();
    table.string('subject', 255).notNullable();
    table.string('notification_type', 50).notNullable();

    // Optional business record relationships
    table.integer('customer_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('customers')
      .onDelete('SET NULL');

    table.integer('invoice_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('invoices')
      .onDelete('SET NULL');

    table.integer('payment_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('payments')
      .onDelete('SET NULL');

    table.integer('work_order_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('work_orders')
      .onDelete('SET NULL');

    // Provider tracking
    table.string('provider', 40).notNullable().defaultTo('RESEND');
    table.string('provider_message_id', 255).nullable();

    // Delivery lifecycle
    table.string('status', 30).notNullable().defaultTo('QUEUED');

    // Failure and retry tracking
    table.text('error_message').nullable();
    table.integer('retry_count').unsigned().notNullable().defaultTo(0);

    // Duplicate notification protection
    table.string('idempotency_key', 255).nullable().unique();

    // Delivery timestamps
    table.timestamp('sent_at').nullable();
    table.timestamp('delivered_at').nullable();

    // Audit timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Query indexes
    table.index('recipient');
    table.index('notification_type');
    table.index('customer_id');
    table.index('invoice_id');
    table.index('payment_id');
    table.index('work_order_id');
    table.index('provider_message_id');
    table.index('status');
    table.index('created_at');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('email_logs');
};