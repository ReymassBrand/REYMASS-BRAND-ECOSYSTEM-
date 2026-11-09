require('dotenv').config();

const db = require('./src/db');

async function checkMpesaSchema() {
  try {
    const columns = await db.raw(
      'PRAGMA table_info("mpesa_stk_requests")'
    );

    const indexes = await db.raw(
      'PRAGMA index_list("mpesa_stk_requests")'
    );

    console.log('\n=== M-PESA TABLE COLUMNS ===');
    console.dir(columns, { depth: 5 });

    console.log('\n=== M-PESA TABLE INDEXES ===');
    console.dir(indexes, { depth: 5 });
  } catch (error) {
    console.error('Schema inspection failed:', error.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

checkMpesaSchema();