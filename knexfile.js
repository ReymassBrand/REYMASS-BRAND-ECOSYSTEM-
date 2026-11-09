require('dotenv').config();
const path = require('path');

const migrationsDirectory = path.resolve(
  __dirname,
  './database/migrations'
);

const seedsDirectory = path.resolve(
  __dirname,
  './database/seeds'
);

module.exports = {
  // LOCAL DEVELOPMENT — SQLite
  development: {
    client: process.env.DB_CLIENT || 'sqlite3',
    connection: {
      filename: path.resolve(
        __dirname,
        process.env.DB_FILENAME || './database/reymass_one.sqlite'
      )
    },
    useNullAsDefault: true,
    migrations: {
      directory: migrationsDirectory
    },
    seeds: {
      directory: seedsDirectory
    }
  },

  // AUTOMATED TESTS — SQLite in-memory
  test: {
    client: 'sqlite3',
    connection: {
      filename: ':memory:'
    },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      idleTimeoutMillis: 86400000,
      destroyTimeoutMillis: 86400000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200
    },
    migrations: {
      directory: migrationsDirectory
    },
    seeds: {
      directory: seedsDirectory
    }
  },

  // PRODUCTION — Railway PostgreSQL
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: migrationsDirectory
    },
    seeds: {
      directory: seedsDirectory
    }
  }
};