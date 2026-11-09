/**
 * REYMASS ONE - Inventory Routes
 * REYMASS BRAND INVESTMENT LTD
 */

const express = require('express');
const router = express.Router();

const inventoryController = require('../controllers/inventoryController');
const {
  verifyToken,
  hasPermission
} = require('../middleware/authMiddleware');

// Retrieve inventory stock levels
router.get(
  '/',
  verifyToken,
  hasPermission('inventory.view'),
  inventoryController.getInventoryStock
);

// Create a catalogue item and initialize stock
router.post(
  '/',
  verifyToken,
  hasPermission('inventory.create'),
  inventoryController.createCatalogItem
);
// Receive additional inventory stock
router.post(
  '/:stockId/stock-in',
  verifyToken,
  hasPermission('inventory.adjust'),
  inventoryController.stockIn
);

// Manually adjust inventory stock
router.post(
  '/:stockId/adjust',
  verifyToken,
  hasPermission('inventory.adjust'),
  inventoryController.adjustStock
);
module.exports = router;
