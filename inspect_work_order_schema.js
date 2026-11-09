const db = require('./src/db');

async function inspect() {
  try {
    const columns = await db('work_orders').columnInfo();

    console.log('\n=== WORK ORDERS TABLE ===');

    for (const [name, details] of Object.entries(columns)) {
      console.log({
        column: name,
        type: details.type,
        nullable: details.nullable,
        defaultValue: details.defaultValue
      });
    }

    console.log('\n=== WORK ORDER MIGRATIONS ===');

    const migrations = await db('knex_migrations')
      .select('name')
      .orderBy('name');

    migrations
      .filter(item => item.name.toLowerCase().includes('work_order'))
      .forEach(item => console.log(item.name));

  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

inspect();
