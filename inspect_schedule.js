const db = require('./src/db');

(async () => {
  const columns = await db('work_orders').columnInfo();
  console.log('scheduled_date column:', columns.scheduled_date);

  const rows = await db('work_orders')
    .whereNotNull('scheduled_date')
    .select('id', 'scheduled_date')
    .limit(5);

  console.log('Existing scheduled dates:', rows);
  await db.destroy();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
