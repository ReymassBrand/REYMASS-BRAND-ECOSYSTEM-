/**
 * REYMASS ONE
 * Material Allocation History
 *
 * Records inventory allocated to work orders.
 * Preserves an audit trail of stock movements.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('material_allocations', (table) => {
    table.increments('id').primary();

    table.integer('work_order_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('work_orders');

    table.integer('catalog_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('services_catalog');

    table.integer('stock_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('inventory_stock');

    table.integer('subsidiary_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('subsidiaries');

    table.integer('allocated_by_user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users');

    table.integer('quantity')
      .unsigned()
      .notNullable();

    table.string('item_code').notNullable();
    table.string('item_name').notNullable();
    table.string('warehouse_location');

    table.timestamps(true, true);

    table.index('work_order_id');
    table.index('catalog_id');
    table.index('subsidiary_id');
    table.index('allocated_by_user_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('material_allocations');
};
