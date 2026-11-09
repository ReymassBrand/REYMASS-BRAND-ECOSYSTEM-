const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  // Clear existing tables
  await knex('role_permissions').del();
  await knex('users').del();
  await knex('permissions').del();
  await knex('roles').del();
  await knex('subsidiaries').del();
  await knex('organizations').del();

  // 1. Organization
  const [orgId] = await knex('organizations').insert({
    name: 'REYMASS BRAND INVESTMENT LTD',
    registration_number: 'PVT-REYMASS-2026',
    email: 'info@reymass.com',
    phone: '+254700000000',
    website: 'https://reymass.com'
  }).returning('id');

  const parentOrgId = typeof orgId === 'object' ? orgId.id : orgId;

  // 2. Subsidiaries
  await knex('subsidiaries').insert([
    { organization_id: parentOrgId, code: 'TECH', name: 'REYMASS TECH SUITE', description: 'IT Solutions, ISP, Software Development' },
    { organization_id: parentOrgId, code: 'FARMS', name: 'REYMASS FARMS', description: 'Agricultural Ventures & Produce Management' },
    { organization_id: parentOrgId, code: 'HOMES', name: 'REYMASS HOMES', description: 'Real Estate & Property Management' },
    { organization_id: parentOrgId, code: 'ENG', name: 'REYMASS ENGINEERING SOLUTIONS', description: 'Engineering, Fiber & Infrastructure' }
  ]);

  // 3. Roles
  const roles = [
    { name: 'SUPER_ADMIN', display_name: 'Super Administrator', description: 'Full Unrestricted System Access' },
    { name: 'CEO', display_name: 'CEO / Executive Management', description: 'Executive Oversight Across All Subsidiaries' },
    { name: 'FINANCE', display_name: 'Finance Officer', description: 'Billing, Payments, Receipts, Petty Cash, Reports' },
    { name: 'SALES', display_name: 'Sales Representative', description: 'Leads, CRM, Quotations, Sales Pipelines' },
    { name: 'OPERATIONS_MANAGER', display_name: 'Operations Manager', description: 'Projects, Work Orders, Specialist Management' },
    { name: 'SPECIALIST', display_name: 'Specialist / Technician', description: 'Assigned Work Orders and Field Tasks' },
    { name: 'CUSTOMER', display_name: 'Client Account', description: 'Customer Portal Access' }
  ];

  for (const role of roles) {
    await knex('roles').insert(role);
  }

  // 4. Base Permissions
  const permissions = [
    { slug: 'customers.view', module: 'CUSTOMERS', description: 'View customer records' },
    { slug: 'customers.create', module: 'CUSTOMERS', description: 'Create new customer records' },
    { slug: 'customers.edit', module: 'CUSTOMERS', description: 'Edit existing customer records' },
    { slug: 'quotations.view', module: 'BILLING', description: 'View quotations' },
    { slug: 'quotations.create', module: 'BILLING', description: 'Create quotations' },
    { slug: 'quotations.approve', module: 'BILLING', description: 'Approve quotations' },
    { slug: 'invoices.view', module: 'BILLING', description: 'View invoices' },
    { slug: 'invoices.create', module: 'BILLING', description: 'Create invoices' },
    { slug: 'payments.view', module: 'FINANCE', description: 'View payment records' },
    { slug: 'payments.record', module: 'FINANCE', description: 'Record manual or gateway payments' },
    { slug: 'reports.view', module: 'ANALYTICS', description: 'View business performance reports' }
  ];

  for (const perm of permissions) {
    await knex('permissions').insert(perm);
  }

  // 5. Assign Permissions to SUPER_ADMIN Role
  const superAdminRole = await knex('roles').where({ name: 'SUPER_ADMIN' }).first();
  const allPermissions = await knex('permissions').select('id');

  for (const perm of allPermissions) {
    await knex('role_permissions').insert({
      role_id: superAdminRole.id,
      permission_id: perm.id
    });
  }

  // 6. Super Admin Initial User
  const passwordHash = await bcrypt.hash('Admin@REYMASS2026!', 12);
  await knex('users').insert({
    role_id: superAdminRole.id,
    first_name: 'System',
    last_name: 'Administrator',
    email: 'admin@reymass.com',
    phone: '+254700000001',
    password_hash: passwordHash,
    is_active: true
  });

  console.log('REYMASS ONE initial data seeded successfully.');
};