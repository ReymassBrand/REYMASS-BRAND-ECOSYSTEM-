/**
 * REYMASS ONE - Work Order Routes
 * REYMASS BRAND INVESTMENT LTD
 */

const express = require('express');
const router = express.Router();

const workOrderController = require('../controllers/workOrderController');
const {
  verifyToken,
  hasPermission
} = require('../middleware/authMiddleware');

// Allocate materials to a work order
router.post(
  '/allocate-material',
  verifyToken,
  hasPermission('inventory.allocate'),
  workOrderController.allocateMaterialToWorkOrder
);

// Create a work order
router.post(
  '/',
  verifyToken,
  hasPermission('work_orders.create'),
  workOrderController.createWorkOrder
);

// Retrieve work orders
router.get(
  '/',
  verifyToken,
  hasPermission('work_orders.view'),
  workOrderController.getWorkOrders
);
// Update work-order status and record lifecycle history
router.patch(
  '/:id/status',
  verifyToken,
  hasPermission('work_orders.update'),
  workOrderController.updateWorkOrderStatus
);
// Reschedule a work order
router.patch(
  '/:id/schedule',
  verifyToken,
  hasPermission('work_orders.update'),
  workOrderController.rescheduleWorkOrder
);
// Retrieve individual work-order details
router.get(
  '/:id',
  verifyToken,
  hasPermission('work_orders.view'),
  workOrderController.getWorkOrderById
);

// Retrieve work-order status history
router.get(
  '/:id/history',
  verifyToken,
  hasPermission('work_orders.view'),
  workOrderController.getWorkOrderHistory
);
module.exports = router;
