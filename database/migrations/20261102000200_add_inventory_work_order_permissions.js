/**
 * REYMASS ONE
 * Add inventory and work-order permissions.
 *
 * Existing permissions and unrelated role assignments are preserved.
 */

const permissionDefinitions = [
  {
    slug: 'inventory.view',
    module: 'INVENTORY',
    description: 'View inventory and stock levels'
  },
  {
    slug: 'inventory.create',
    module: 'INVENTORY',
    description: 'Create catalogue items'
  },
  {
    slug: 'inventory.edit',
    module: 'INVENTORY',
    description: 'Edit catalogue items'
  },
  {
    slug: 'inventory.allocate',
    module: 'INVENTORY',
    description: 'Allocate materials to work orders'
  },
  {
    slug: 'inventory.adjust',
    module: 'INVENTORY',
    description: 'Adjust inventory stock quantities'
  },
  {
    slug: 'work_orders.view',
    module: 'OPERATIONS',
    description: 'View work orders'
  },
  {
    slug: 'work_orders.create',
    module: 'OPERATIONS',
    description: 'Create work orders'
  },
  {
    slug: 'work_orders.assign',
    module: 'OPERATIONS',
    description: 'Assign specialists to work orders'
  },
  {
    slug: 'work_orders.update',
    module: 'OPERATIONS',
    description: 'Update work-order progress'
  }
];

const rolePermissions = {
  SUPER_ADMIN: [
    'inventory.view',
    'inventory.create',
    'inventory.edit',
    'inventory.allocate',
    'inventory.adjust',
    'work_orders.view',
    'work_orders.create',
    'work_orders.assign',
    'work_orders.update'
  ],

  CEO: [
    'inventory.view',
    'work_orders.view'
  ],

  OPERATIONS_MANAGER: [
    'inventory.view',
    'inventory.create',
    'inventory.edit',
    'inventory.allocate',
    'inventory.adjust',
    'work_orders.view',
    'work_orders.create',
    'work_orders.assign',
    'work_orders.update'
  ],

  SPECIALIST: [
    'inventory.view',
    'inventory.allocate',
    'work_orders.view',
    'work_orders.update'
  ],

  FINANCE: [
    'inventory.view',
    'work_orders.view'
  ],

  SALES: [
    'inventory.view',
    'work_orders.view'
  ]
};

exports.up = async function (knex) {
  await knex.transaction(async (trx) => {
    // Insert permissions only when they do not already exist.
    for (const permission of permissionDefinitions) {
      const existing = await trx('permissions')
        .where({ slug: permission.slug })
        .first();

      if (!existing) {
        await trx('permissions').insert(permission);
      }
    }

    // Assign permissions to the specified roles.
   for (const [roleName, slugs] of Object.entries(rolePermissions)) {
  const role = await trx('roles')
    .where({ name: roleName })
    .first();

  // Allow fresh test databases without seeded roles.
  if (!role) {
    continue;
  }

  for (const slug of slugs) {
    const permission = await trx('permissions')
      .where({ slug })
      .first();

    if (!permission) {
      continue;
    }

        const assignmentExists = await trx('role_permissions')
          .where({
            role_id: role.id,
            permission_id: permission.id
          })
          .first();

        if (!assignmentExists) {
          await trx('role_permissions').insert({
            role_id: role.id,
            permission_id: permission.id
          });
        }
      }
    }
  });
};

exports.down = async function (knex) {
  await knex.transaction(async (trx) => {
    const slugs = permissionDefinitions.map((permission) => permission.slug);

    const permissions = await trx('permissions')
      .whereIn('slug', slugs)
      .select('id');

    const permissionIds = permissions.map((permission) => permission.id);

    if (permissionIds.length) {
      await trx('role_permissions')
        .whereIn('permission_id', permissionIds)
        .del();

      await trx('permissions')
        .whereIn('id', permissionIds)
        .del();
    }
  });
};
