exports.up = async function (knex) {
  const exists = await knex('permissions')
    .where({ slug: 'customers.delete' })
    .first();

  if (!exists) {
    await knex('permissions').insert({
      slug: 'customers.delete',
      module: 'CUSTOMERS',
      description: 'Deactivate customer records'
    });
  }
};

exports.down = async function (knex) {
  const permission = await knex('permissions')
    .where({ slug: 'customers.delete' })
    .first();

  if (!permission) return;

  await knex('role_permissions')
    .where({ permission_id: permission.id })
    .del();

  await knex('permissions')
    .where({ id: permission.id })
    .del();
};
