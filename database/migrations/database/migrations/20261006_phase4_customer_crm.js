/**
 * REYMASS ONE - Phase 4
 * Customer 360 + CRM
 *
 * Adds:
 * - Customer <-> Subsidiary relationships
 * - Customer contacts
 * - Customer addresses
 * - Customer notes
 * - Customer services
 * - Leads
 * - Lead activities
 * - Sales opportunities
 */

exports.up = function (knex) {
  return knex.schema

    // 1. Customer <-> Subsidiary relationship
    .createTable('customer_subsidiaries', (table) => {
      table.integer('customer_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('customers')
        .onDelete('CASCADE');

      table.integer('subsidiary_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('subsidiaries')
        .onDelete('CASCADE');

      table.boolean('is_primary').defaultTo(false);
      table.boolean('is_active').defaultTo(true);

      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.primary(['customer_id', 'subsidiary_id']);
    })

    // 2. Customer Contacts
    .createTable('customer_contacts', (table) => {
      table.increments('id').primary();

      table.integer('customer_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('customers')
        .onDelete('CASCADE');

      table.string('first_name').notNullable();
      table.string('last_name');
      table.string('job_title');
      table.string('email');
      table.string('phone');
      table.string('whatsapp');
      table.boolean('is_primary').defaultTo(false);
      table.boolean('is_active').defaultTo(true);

      table.timestamps(true, true);
    })

    // 3. Customer Addresses
    .createTable('customer_addresses', (table) => {
      table.increments('id').primary();

      table.integer('customer_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('customers')
        .onDelete('CASCADE');

      table.string('address_type').notNullable().defaultTo('PRIMARY');
      table.string('address_line_1').notNullable();
      table.string('address_line_2');
      table.string('city');
      table.string('county');
      table.string('postal_code');
      table.string('country').defaultTo('Kenya');

      table.boolean('is_primary').defaultTo(false);
      table.timestamps(true, true);
    })

    // 4. Customer Notes
    .createTable('customer_notes', (table) => {
      table.increments('id').primary();

      table.integer('customer_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('customers')
        .onDelete('CASCADE');

      table.integer('created_by')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');

      table.text('note').notNullable();
      table.boolean('is_important').defaultTo(false);

      table.timestamps(true, true);
    })

    // 5. Customer Services
    .createTable('customer_services', (table) => {
      table.increments('id').primary();

      table.integer('customer_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('customers')
        .onDelete('CASCADE');

      table.integer('subsidiary_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('subsidiaries');

      table.integer('catalog_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('services_catalog')
        .onDelete('SET NULL');

      table.string('service_name').notNullable();

      table.string('service_reference').unique();

      table.date('start_date');
      table.date('end_date');

      table.string('status')
        .notNullable()
        .defaultTo('ACTIVE');

      table.decimal('recurring_amount', 14, 2)
        .defaultTo(0.00);

      table.string('billing_cycle')
        .defaultTo('MONTHLY');

      table.text('notes');

      table.timestamps(true, true);
    })

    // 6. Leads
    .createTable('leads', (table) => {
      table.increments('id').primary();

      table.string('lead_number')
        .unique()
        .notNullable();

      table.integer('subsidiary_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('subsidiaries')
        .onDelete('SET NULL');

      table.string('name').notNullable();
      table.string('company_name');
      table.string('email');
      table.string('phone');

      table.string('source');
      table.string('interest');

      table.string('status')
        .notNullable()
        .defaultTo('NEW');

      table.integer('assigned_to')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');

      table.text('notes');

      table.timestamp('converted_at');

      table.integer('converted_customer_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('customers')
        .onDelete('SET NULL');

      table.timestamps(true, true);
    })

    // 7. Lead Activities
    .createTable('lead_activities', (table) => {
      table.increments('id').primary();

      table.integer('lead_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('leads')
        .onDelete('CASCADE');

      table.integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');

      table.string('activity_type').notNullable();
      table.text('description');

      table.timestamp('activity_date')
        .defaultTo(knex.fn.now());

      table.timestamps(true, true);
    })

    // 8. Sales Opportunities
    .createTable('sales_opportunities', (table) => {
      table.increments('id').primary();

      table.string('opportunity_number')
        .unique()
        .notNullable();

      table.integer('lead_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('leads')
        .onDelete('SET NULL');

      table.integer('customer_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('customers')
        .onDelete('SET NULL');

      table.integer('subsidiary_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('subsidiaries')
        .onDelete('SET NULL');

      table.integer('assigned_to')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');

      table.string('title').notNullable();

      table.text('description');

      table.decimal('estimated_value', 14, 2)
        .defaultTo(0.00);

      table.string('stage')
        .notNullable()
        .defaultTo('NEW');

      table.integer('probability')
        .defaultTo(0);

      table.date('expected_close_date');

      table.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('sales_opportunities')
    .dropTableIfExists('lead_activities')
    .dropTableIfExists('leads')
    .dropTableIfExists('customer_services')
    .dropTableIfExists('customer_notes')
    .dropTableIfExists('customer_addresses')
    .dropTableIfExists('customer_contacts')
    .dropTableIfExists('customer_subsidiaries');
};