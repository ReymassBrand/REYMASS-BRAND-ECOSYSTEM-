require('dotenv').config();
const path = require('path');

module.exports = {
  development: {
    client: process.env.DB_CLIENT || 'sqlite3',
    connection: {
      filename: path.resolve(__dirname, process.env.DB_FILENAME || './database/reymass_one.sqlite')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve(__dirname, './database/migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, './database/seeds')
    }
  },

  test: {
    client: 'sqlite3',
    connection: {
      filename: ':memory:'
    },
    useNullAsDefault: true,
    // CRITICAL: Forces SQLite to keep a single shared connection alive for in-memory tests
    pool: {
      min: 1,
      max: 1,
      idleTimeoutMillis: 86400000,
      destroyTimeoutMillis: 86400000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200
    },
    migrations: {
      directory: path.resolve(__dirname, './database/migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, './database/seeds')
    }
  }
};