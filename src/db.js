const knex = require('knex');
const knexfile = require('../knexfile');

// Automatically switch to 'test' environment if running inside Jest
const environment = process.env.NODE_ENV || (process.env.JEST_WORKER_ID ? 'test' : 'development');
const config = knexfile[environment] || knexfile.development || knexfile;

// Initialize Knex instance
const db = knex(config);

module.exports = db;