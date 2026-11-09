require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  REYMASS ONE - Digital Operating System Core`);
  console.log(`  Company: REYMASS BRAND INVESTMENT LTD`);
  console.log(`  Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`=======================================================`);
});