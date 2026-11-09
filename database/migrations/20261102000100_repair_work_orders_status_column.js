/**
 * REYMASS ONE
 * Repair work_orders.status schema consistency.
 *
 * Existing databases that already have the column remain unchanged.
 * Fresh databases receive the missing status column.
 */

exports.up = async function (knex) {
  const tableExists = await knex.schema.hasTable('work_orders');

  if (!tableExists) {
    return;
  }

  const statusExists = await knex.schema.hasColumn(
    'work_orders',
    'status'
  );

  if (!statusExists) {
    await knex.schema.alterTable('work_orders', (table) => {
      table.string('status').notNullable().defaultTo('PENDING');
    });
  }
};

/**
 * Intentionally non-destructive.
 *
 * The status column may have existed before this migration.
 * Removing it during rollback could break existing functionality.
 */
exports.down = async function (knex) {
  // No operation: preserve the work_orders.status column.
};
