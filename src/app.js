const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// 1. Import API Route Modules
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const billingRoutes = require('./routes/billingRoutes');
const workOrderRoutes = require('./routes/workOrderRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const mpesaRoutes = require('./routes/mpesaRoutes');
const app = express();

// Trust Railway's reverse proxy for accurate client IP detection.
app.set('trust proxy', 1);

// 2. Global Security & Parsing Middleware
app.use(helmet());
app.use(cors());

// Parse incoming JSON request bodies.
app.use(express.json({ limit: '100kb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests from this IP.' }
});
app.use('/api/', limiter);

// 3. Health Check Endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'ONLINE',
    system: 'REYMASS ONE - Digital Operating System',
    company: 'REYMASS BRAND INVESTMENT LTD',
    timestamp: new Date().toISOString()
  });
});

// 4. Mount Domain API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/customers', customerRoutes);

// Backward compatibility route
app.use('/api/customers', customerRoutes);

app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/work-orders', workOrderRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/mpesa', mpesaRoutes);

module.exports = app;