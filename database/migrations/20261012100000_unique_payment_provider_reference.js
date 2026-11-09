/**
 * REYMASS ONE
 * Enforce uniqueness of external payment provider references.
 *
 * SQLite permits multiple NULL values in a unique index.
 * Empty references are excluded because they are not valid transaction IDs.
 */
exports.up = function (knex) {
  return knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_reference_unique
    ON payments (provider_reference)
    WHERE provider_reference IS NOT NULL
      AND TRIM(provider_reference) <> ''
  `);
};

exports.down = function (knex) {
  return knex.raw(
    'DROP INDEX IF EXISTS payments_provider_reference_unique'
  );
};
