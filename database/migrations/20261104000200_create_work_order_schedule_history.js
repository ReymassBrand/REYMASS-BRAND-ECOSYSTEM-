/**
 * REYMASS ONE
 * Work Order Schedule History
 *
 * Records initial scheduling and every subsequent rescheduling
 * for operational accountability and auditing.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('work_order_schedule_history', function (table) {
    table.increments('id').primary();

    table.integer('work_order_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('work_orders')
      .onDelete('CASCADE');

    table.datetime('previous_scheduled_date').nullable();
    table.datetime('new_scheduled_date').notNullable();

    table.integer('changed_by_user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table.text('reason').nullable();

    table.timestamp('created_at')
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index('work_order_id');
    table.index('changed_by_user_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('work_order_schedule_history');
};
