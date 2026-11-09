/**
 * REYMASS ONE
 * Enforce one receipt per payment.
 *
 * Each payment may have at most one receipt.
 * Existing data was audited before adding this constraint.
 */

exports.up = function (knex) {
  return knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS receipts_payment_id_unique
    ON receipts (payment_id)
  `);
};

exports.down = function (knex) {
  return knex.raw(
    'DROP INDEX IF EXISTS receipts_payment_id_unique'
  );
};
