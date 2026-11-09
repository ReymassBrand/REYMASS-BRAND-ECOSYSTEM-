/**
 * REYMASS ONE
 * Add Safaricom CheckoutRequestID tracking to STK requests.
 *
 * This migration is idempotent for the column and index,
 * so it can safely handle a partially applied migration.
 */

const TABLE = 'mpesa_stk_requests';
const COLUMN = 'checkout_request_id';
const INDEX = 'mpesa_stk_requests_checkout_request_id_unique';

exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);

  // Add the column only if it does not already exist.
  if (!hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.string(COLUMN).nullable();
    });
  }

 // Check SQLite's existing indexes before creating another one.
const indexes = await knex.raw(`PRAGMA index_list('${TABLE}')`);

  const hasIndex = indexes.some((index) => index.name === INDEX);

  if (!hasIndex) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.unique([COLUMN], INDEX);
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);

  if (!hasColumn) {
    return;
  }

  const indexes = await knex.raw(`PRAGMA index_list('${TABLE}')`);

  const hasIndex = indexes.some((index) => index.name === INDEX);

  if (hasIndex) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.dropUnique([COLUMN], INDEX);
    });
  }

  await knex.schema.alterTable(TABLE, (table) => {
    table.dropColumn(COLUMN);
  });
};