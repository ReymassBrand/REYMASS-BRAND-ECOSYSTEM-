const knex = require('knex');
const knexfile = require('../knexfile');

// Determine the application environment.
const environment =
  process.env.NODE_ENV ||
  (process.env.JEST_WORKER_ID ? 'test' : 'development');

// Never silently fall back to another database environment.
if (!knexfile[environment]) {
  throw new Error(
    `Invalid database environment: ${environment}`
  );
}

// Production must use PostgreSQL and a valid connection URL.
if (environment === 'production') {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required in production. Refusing to start.'
    );
  }

  if (knexfile.production.client !== 'pg') {
    throw new Error(
      'Production database must use PostgreSQL.'
    );
  }
}

const config = knexfile[environment];

// Initialize Knex.
const db = knex(config);

module.exports = db;