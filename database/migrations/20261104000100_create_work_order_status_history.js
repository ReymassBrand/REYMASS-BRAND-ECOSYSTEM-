/**
 * REYMASS ONE
 * Work Order Status History
 *
 * Records every work-order status transition for accountability
 * and operational auditing.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('work_order_status_history', function (table) {
    table.increments('id').primary();

    table.integer('work_order_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('work_orders')
      .onDelete('CASCADE');

    table.string('previous_status', 30).notNullable();
    table.string('new_status', 30).notNullable();

    table.integer('changed_by_user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table.text('notes').nullable();

    table.timestamp('created_at')
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index('work_order_id');
    table.index('changed_by_user_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('work_order_status_history');
};
