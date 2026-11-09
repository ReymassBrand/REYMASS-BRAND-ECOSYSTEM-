/**
 * REYMASS ONE
 * Inventory Stock Movement Ledger
 *
 * Records every stock movement with before-and-after balances.
 */

exports.up = function (knex) {
  return knex.schema.createTable('inventory_movements', (table) => {
    table.increments('id').primary();

    // Related inventory records
    table.integer('stock_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('inventory_stock');

    table.integer('catalog_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('services_catalog');

    table.integer('subsidiary_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('subsidiaries');

    // Type and quantity of movement
    table.string('movement_type', 40).notNullable();

    table.integer('quantity').unsigned().notNullable();

    // Stock balance immediately before and after movement
    table.integer('quantity_before').notNullable();
    table.integer('quantity_after').notNullable();

    // Optional link to the transaction that caused the movement
    table.string('reference_type', 40);
    table.integer('reference_id').unsigned();

    // User responsible for the movement
    table.integer('performed_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.text('notes');

    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Query indexes
    table.index('stock_id');
    table.index('catalog_id');
    table.index('subsidiary_id');
    table.index('movement_type');
    table.index(['reference_type', 'reference_id']);
    table.index('performed_by');
    table.index('created_at');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('inventory_movements');
};