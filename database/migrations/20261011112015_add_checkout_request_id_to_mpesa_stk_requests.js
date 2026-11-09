/**
 * REYMASS ONE
 * Add Safaricom CheckoutRequestID tracking to STK requests.
 *
 * Compatible with SQLite and PostgreSQL.
 *
 * The original table migration creates this column.
 * This migration supports databases where it is missing.
 */

const TABLE = 'mpesa_stk_requests';
const COLUMN = 'checkout_request_id';

exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);

  if (!hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.string(COLUMN).nullable().unique();
    });
  }
};

// Intentionally no-op.
// The original table migration owns this column.
// Dropping it here could damage the original schema.
exports.down = async function () {
  return Promise.resolve();
};