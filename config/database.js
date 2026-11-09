/**
 * REYMASS ONE - Phase 1 Schema Migration
 */
exports.up = function(knex) {
  return knex.schema
    // 1. Organizations (Parent Holding)
    .createTable('organizations', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('registration_number');
      table.string('tax_id');
      table.string('email');
      table.string('phone');
      table.string('website');
      table.timestamps(true, true);
    })
    // 2. Subsidiaries
    .createTable('subsidiaries', (table) => {
      table.increments('id').primary();
      table.integer('organization_id').unsigned().references('id').inTable('organizations').onDelete('CASCADE');
      table.string('code').unique().notNullable(); // e.g. TECH, FARMS, HOMES, ENG
      table.string('name').notNullable();
      table.text('description');
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    })
    // 3. Roles
    .createTable('roles', (table) => {
      table.increments('id').primary();
      table.string('name').unique().notNullable(); // e.g. SUPER_ADMIN, CEO, FINANCE, CUSTOMER
      table.string('display_name').notNullable();
      table.text('description');
      table.timestamps(true, true);
    })
    // 4. Permissions
    .createTable('permissions', (table) => {
      table.increments('id').primary();
      table.string('slug').unique().notNullable(); // e.g. customers.view, invoices.create
      table.string('module').notNullable(); // e.g. CUSTOMERS, BILLING, FINANCE
      table.string('description');
      table.timestamps(true, true);
    })
    // 5. Role Permissions Junction
    .createTable('role_permissions', (table) => {
      table.integer('role_id').unsigned().references('id').inTable('roles').onDelete('CASCADE');
      table.integer('permission_id').unsigned().references('id').inTable('permissions').onDelete('CASCADE');
      table.primary(['role_id', 'permission_id']);
    })
    // 6. Users (Staff & Admins)
    .createTable('users', (table) => {
      table.increments('id').primary();
      table.integer('subsidiary_id').unsigned().nullable().references('id').inTable('subsidiaries');
      table.integer('role_id').unsigned().notNullable().references('id').inTable('roles');
      table.string('first_name').notNullable();
      table.string('last_name').notNullable();
      table.string('email').unique().notNullable();
      table.string('phone').unique();
      table.string('password_hash').notNullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('last_login');
      table.timestamps(true, true);
    })
    // 7. Customers (Unified Customer 360 Core)
    .createTable('customers', (table) => {
      table.increments('id').primary();
      table.string('account_number').unique().notNullable(); // e.g. CUST-2026-00001
      table.string('account_type').notNullable().defaultTo('INDIVIDUAL'); // INDIVIDUAL / CORPORATE
      table.string('name').notNullable();
      table.string('company_name');
      table.string('email').unique().notNullable();
      table.string('phone').notNullable();
      table.string('national_id_or_tax');
      table.string('address');
      table.string('city');
      table.string('country').defaultTo('Kenya');
      table.integer('primary_subsidiary_id').unsigned().references('id').inTable('subsidiaries');
      table.string('status').defaultTo('ACTIVE');
      table.timestamps(true, true);
    })
    // 8. Immutable Audit Logs
    .createTable('audit_logs', (table) => {
      table.bigIncrements('id').primary();
      table.integer('user_id').unsigned().nullable().references('id').inTable('users');
      table.string('action').notNullable(); // e.g. CREATE, UPDATE, DELETE, LOGIN
      table.string('entity_name').notNullable(); // e.g. Invoices, Customers
      table.string('entity_id');
      table.text('old_values');
      table.text('new_values');
      table.string('ip_address');
      table.string('user_agent');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('audit_logs')
    .dropTableIfExists('customers')
    .dropTableIfExists('users')
    .dropTableIfExists('role_permissions')
    .dropTableIfExists('permissions')
    .dropTableIfExists('roles')
    .dropTableIfExists('subsidiaries')
    .dropTableIfExists('organizations');
};require('dotenv').config();
const path = require('path');

module.exports = {
  development: {
    client: process.env.DB_CLIENT || 'sqlite3',
    cection: {
      filename: path.resolve(__dirname, '..', process.env.DB_FILENAME || './database/reymass_one.sqlite')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve(__dirname, '../database/migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, '../database/seeds')
    }
  }
};