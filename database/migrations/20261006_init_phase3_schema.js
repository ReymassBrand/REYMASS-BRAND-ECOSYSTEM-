/**
 * REYMASS ONE - Phase 3 Service Catalog, Inventory & Work Orders
 */
exports.up = function(knex) {
  return knex.schema
    // 1. Service & Product Catalog
    .createTable('services_catalog', (table) => {
      table.increments('id').primary();
      table.integer('subsidiary_id').unsigned().notNullable().references('id').inTable('subsidiaries');
      table.string('item_code').unique().notNullable(); // e.g. TECH-FIBER-50M, ENG-SURVEY-01
      table.string('name').notNullable();
      table.string('item_type').notNullable().defaultTo('SERVICE'); // SERVICE, PRODUCT, ASSET
      table.text('description');
      table.decimal('unit_price', 14, 2).notNullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    })
    // 2. Inventory / Stock Control
    .createTable('inventory_stock', (table) => {
      table.increments('id').primary();
      table.integer('catalog_id').unsigned().notNullable().references('id').inTable('services_catalog').onDelete('CASCADE');
      table.integer('subsidiary_id').unsigned().notNullable().references('id').inTable('subsidiaries');
      table.integer('quantity_on_hand').notNullable().defaultTo(0);
      table.integer('reorder_level').defaultTo(10);
      table.string('warehouse_location').defaultTo('Main HQ Warehouse');
      table.timestamps(true, true);
    })
    // 3. Work Orders Engine
    .createTable('work_orders', (table) => {
      table.increments('id').primary();
      table.string('work_order_number').unique().notNullable(); // e.g. WO-2026-00001
      table.integer('customer_id').unsigned().notNullable().references('id').inTable('customers');
      table.integer('subsidiary_id').unsigned().notNullable().references('id').inTable('subsidiaries');
      table.integer('assigned_specialist_id').unsigned().nullable().references('id').inTable('users');
      table.integer('invoice_id').unsigned().nullable().references('id').inTable('invoices');
      table.string('title').notNullable();
      table.text('description');
      table.string('priority').defaultTo('MEDIUM'); // LOW, MEDIUM, HIGH, URGENT
      table.string('status').defaultTo('PENDING'); // PENDING, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED
      table.timestamp('scheduled_date');
      table.timestamp('completed_at');
      table.timestamps(true, true);
    });  
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('work_orders')
    .dropTableIfExists('inventory_stock')
    .dropTableIfExists('services_catalog');
};