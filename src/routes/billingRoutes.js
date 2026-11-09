const express = require('express');
const router = express.Router();

const {
  verifyToken,
  hasPermission
} = require('../middleware/authMiddleware');

const PaymentService = require('../services/paymentService');
const quotationController = require('../controllers/quotationController');

// Authentication and permission checks
const authenticate = verifyToken;
const canViewBilling = hasPermission('quotations.view');
const canCreateQuotation = hasPermission('quotations.create');
const canManageQuotation = hasPermission('quotations.manage');
const canRecordPayment = hasPermission('payments.record');

// ========================================
// QUOTATIONS
// ========================================

router.get(
  '/quotations',
  authenticate,
  canViewBilling,
  quotationController.listQuotations
);

router.post(
  '/quotations',
  authenticate,
  canCreateQuotation,
  quotationController.createQuotation
);

router.get(
  '/quotations/:id',
  authenticate,
  canViewBilling,
  quotationController.getQuotation
);

router.patch(
  '/quotations/:id/status',
  authenticate,
  canManageQuotation,
  quotationController.updateQuotationStatus
);

// ========================================
// MANUAL PAYMENT RECORDING
// ========================================

router.post(
  '/payments',
  authenticate,
  canRecordPayment,
  async (req, res) => {
    try {
      const {
        invoiceId,
        amount,
        paymentMethod,
        transactionRef
      } = req.body;

           if (
        invoiceId === undefined ||
        invoiceId === null ||
        invoiceId === '' ||
        amount === undefined ||
        amount === null ||
        amount === ''
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invoice ID and amount are required.'
        });
      }

      const receipt = await PaymentService.recordPayment({
        invoiceId,
        amount,
        paymentMethod,
        transactionRef
      });

      return res.status(201).json({
        success: true,
        message: 'Payment recorded and receipt generated successfully.',
        data: receipt
      });

    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
);

module.exports = router;