/**
 * REYMASS ONE
 * M-Pesa API Routes
 */

const express = require('express');
const router = express.Router();

const {
  verifyToken,
  hasPermission
} = require('../middleware/authMiddleware');

const mpesaController = require('../controllers/mpesaController');

// Only authenticated users with payment-recording permission
// may initiate M-Pesa STK Push requests.
router.post(
  '/stk-push',
  verifyToken,
  hasPermission('payments.record'),
  mpesaController.initiateStkPush
);

// Public endpoint: Safaricom must be able to reach the callback.
// Callback processing must validate and reconcile incoming payments.
router.post(
  '/callback',
  mpesaController.handleCallback
);

module.exports = router;
