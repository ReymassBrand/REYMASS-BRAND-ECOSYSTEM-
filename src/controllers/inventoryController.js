const db = require('../db');

const GLOBAL_INVENTORY_ROLES = [
  'SUPER_ADMIN',
  'CEO',
  'FINANCE'
];

const SUBSIDIARY_INVENTORY_ROLES = [
  'OPERATIONS_MANAGER',
  'SPECIALIST',
  'SALES'
];

// Safely extract inserted ID across database drivers.
const getInsertedId = (result) => {
  const inserted = Array.isArray(result) ? result[0] : result;

  return typeof inserted === 'object' && inserted !== null
    ? inserted.id
    : inserted;
};

// Create catalogue item and initialize stock.
const createCatalogItem = async (req, res, next) => {
  try {
    const {
      subsidiaryId,
      itemCode,
      name,
      itemType,
      description,
      unitPrice,
      initialStock,
      warehouseLocation
    } = req.body;

    const role = req.user?.role;
    const assignedSubsidiaryId = req.user?.subsidiaryId;

    // Only authorized operational roles may create catalogue items.
    if (!['SUPER_ADMIN', 'OPERATIONS_MANAGER'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to create catalogue items.'
      });
    }

    // Operations managers are restricted to their assigned subsidiary.
    let targetSubsidiaryId;

    if (role === 'OPERATIONS_MANAGER') {
      if (!assignedSubsidiaryId) {
        return res.status(403).json({
          success: false,
          message: 'No subsidiary is assigned to your account.'
        });
      }

      if (
        subsidiaryId !== undefined &&
        Number(subsidiaryId) !== Number(assignedSubsidiaryId)
      ) {
        return res.status(403).json({
          success: false,
          message: 'You cannot create inventory for another subsidiary.'
        });
      }

      targetSubsidiaryId = assignedSubsidiaryId;
    } else {
      targetSubsidiaryId = subsidiaryId;
    }

    if (!targetSubsidiaryId || !itemCode || !name || unitPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: 'subsidiaryId, itemCode, name, and unitPrice are required.'
      });
    }

    const normalizedItemCode = String(itemCode).trim();
    const normalizedName = String(name).trim();
    const normalizedItemType = String(itemType || 'PRODUCT').trim().toUpperCase();

    if (!normalizedItemCode || !normalizedName) {
      return res.status(400).json({
        success: false,
        message: 'Item code and name cannot be empty.'
      });
    }

    if (!['SERVICE', 'PRODUCT', 'ASSET'].includes(normalizedItemType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item type. Use SERVICE, PRODUCT, or ASSET.'
      });
    }

    const price = Number(unitPrice);
    const stockQuantity = initialStock === undefined
      ? 0
      : Number(initialStock);

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        success: false,
        message: 'Unit price must be a valid non-negative number.'
      });
    }

    if (
      !Number.isSafeInteger(stockQuantity) ||
      stockQuantity < 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Initial stock must be a non-negative whole number.'
      });
    }

    if (normalizedItemType !== 'PRODUCT' && stockQuantity !== 0) {
      return res.status(400).json({
        success: false,
        message: 'Initial stock can only be specified for products.'
      });
    }

    // Confirm that the target subsidiary exists and is active.
    const subsidiary = await db('subsidiaries')
      .where({ id: targetSubsidiaryId })
      .where({ is_active: true })
      .first();

    if (!subsidiary) {
      return res.status(400).json({
        success: false,
        message: 'The selected subsidiary does not exist or is inactive.'
      });
    }

    // Create catalogue item and stock record together.
    const result = await db.transaction(async (trx) => {
      const insertResult = await trx('services_catalog')
        .insert({
          subsidiary_id: targetSubsidiaryId,
          item_code: normalizedItemCode,
          name: normalizedName,
          item_type: normalizedItemType,
          description: description || null,
          unit_price: price
        })
        .returning('id');

      const actualItemId = getInsertedId(insertResult);

      if (!actualItemId) {
        throw new Error('Failed to retrieve the new catalogue item ID.');
      }

      if (normalizedItemType === 'PRODUCT') {
  const stockInsertResult = await trx('inventory_stock')
    .insert({
      catalog_id: actualItemId,
      subsidiary_id: targetSubsidiaryId,
      quantity_on_hand: stockQuantity,
      warehouse_location: warehouseLocation || 'Main HQ Warehouse'
    })
    .returning('id');

  const stockId = getInsertedId(stockInsertResult);

  if (!stockId) {
    throw new Error('Failed to retrieve the new inventory stock ID.');
  }

  // Record opening stock in the permanent movement ledger.
  if (stockQuantity > 0) {
    await trx('inventory_movements').insert({
      stock_id: stockId,
      catalog_id: actualItemId,
      subsidiary_id: targetSubsidiaryId,
      movement_type: 'OPENING_BALANCE',
      quantity: stockQuantity,
      quantity_before: 0,
      quantity_after: stockQuantity,
      reference_type: 'CATALOG_ITEM',
      reference_id: actualItemId,
      performed_by: req.user?.userId || null,
      notes: 'Initial stock recorded during product creation.'
    });
  }
}

      return {
        id: actualItemId,
        itemCode: normalizedItemCode,
        name: normalizedName,
        itemType: normalizedItemType,
        initialStock: stockQuantity
      };
    });

    return res.status(201).json({
      success: true,
      message: 'Catalog item created successfully.',
      data: result
    });

  } catch (error) {
    next(error);
  }
};

// Retrieve inventory according to the authenticated user's role.
const getInventoryStock = async (req, res, next) => {
  try {
    const role = req.user?.role;
    const assignedSubsidiaryId = req.user?.subsidiaryId;

    if (
      !GLOBAL_INVENTORY_ROLES.includes(role) &&
      !SUBSIDIARY_INVENTORY_ROLES.includes(role)
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view inventory.'
      });
    }

    const query = db('inventory_stock')
      .join(
        'services_catalog',
        'inventory_stock.catalog_id',
        'services_catalog.id'
      )
      .join(
        'subsidiaries',
        'inventory_stock.subsidiary_id',
        'subsidiaries.id'
      )
      .select(
        'inventory_stock.id as stock_id',
        'services_catalog.id as catalog_item_id',
        'services_catalog.item_code',
        'services_catalog.name as item_name',
        'services_catalog.item_type',
        'services_catalog.unit_price',
        'inventory_stock.quantity_on_hand',
        'inventory_stock.reorder_level',
        'inventory_stock.warehouse_location',
        'subsidiaries.id as subsidiary_id',
        'subsidiaries.code as subsidiary_code'
      );

    // Restrict operational employees to their assigned subsidiary.
    if (SUBSIDIARY_INVENTORY_ROLES.includes(role)) {
      if (!assignedSubsidiaryId) {
        return res.status(403).json({
          success: false,
          message: 'No subsidiary is assigned to your account.'
        });
      }

      query.where(
        'inventory_stock.subsidiary_id',
        assignedSubsidiaryId
      );
    }

    const stock = await query.orderBy('services_catalog.name', 'asc');

    return res.status(200).json({
      success: true,
      count: stock.length,
      data: stock
    });

  } catch (error) {
    next(error);
  }
};
// Receive additional stock into an existing inventory record.
const stockIn = async (req, res, next) => {
  try {
    const stockId = Number(req.params.stockId);
    const quantity = Number(req.body.quantity);
    const notes = req.body.notes || 'Additional stock received.';

    const role = req.user?.role;
    const assignedSubsidiaryId = req.user?.subsidiaryId;

    // Only authorized operational roles may receive stock.
    if (!['SUPER_ADMIN', 'OPERATIONS_MANAGER'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to receive inventory stock.'
      });
    }

    if (
      !Number.isSafeInteger(stockId) ||
      stockId <= 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'A valid stock ID and positive whole-number quantity are required.'
      });
    }

    // Operations managers can only receive stock for their subsidiary.
    if (role === 'OPERATIONS_MANAGER' && !assignedSubsidiaryId) {
      return res.status(403).json({
        success: false,
        message: 'No subsidiary is assigned to your account.'
      });
    }

    const result = await db.transaction(async (trx) => {
      let stockQuery = trx('inventory_stock')
        .where({ id: stockId });

      if (role === 'OPERATIONS_MANAGER') {
        stockQuery = stockQuery.where({
          subsidiary_id: assignedSubsidiaryId
        });
      }

      const stock = await stockQuery.first();

      if (!stock) {
        return {
          status: 404,
          message: 'Inventory stock record not found.'
        };
      }

      // Increase stock atomically.
      const updatedRows = await trx('inventory_stock')
        .where({ id: stockId })
        .increment('quantity_on_hand', quantity);

      if (!updatedRows) {
        throw new Error('Stock update failed.');
      }

      const updatedStock = await trx('inventory_stock')
        .where({ id: stockId })
        .first();

      const quantityAfter = Number(updatedStock.quantity_on_hand);
      const quantityBefore = quantityAfter - quantity;

      // Record the stock receipt in the permanent movement ledger.
      await trx('inventory_movements').insert({
        stock_id: stock.id,
        catalog_id: stock.catalog_id,
        subsidiary_id: stock.subsidiary_id,
        movement_type: 'STOCK_IN',
        quantity,
        quantity_before: quantityBefore,
        quantity_after: quantityAfter,
        reference_type: 'MANUAL_STOCK_IN',
        performed_by: req.user?.userId || null,
        notes
      });

      return {
        status: 200,
        data: {
          stockId: stock.id,
          quantityReceived: quantity,
          quantityBefore,
          quantityAfter
        }
      };
    });

    if (result.status !== 200) {
      return res.status(result.status).json({
        success: false,
        message: result.message
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Stock received successfully.',
      data: result.data
    });

  } catch (error) {
    next(error);
  }
};
// Manually increase or decrease inventory stock.
const adjustStock = async (req, res, next) => {
  try {
    const stockId = Number(req.params.stockId);
    const quantity = Number(req.body.quantity);
    const direction = req.body.direction;
    const notes = req.body.notes;

    const role = req.user?.role;
    const assignedSubsidiaryId = req.user?.subsidiaryId;

    // Only operational administrators can adjust stock.
    if (!['SUPER_ADMIN', 'OPERATIONS_MANAGER'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to adjust inventory stock.'
      });
    }

    // Validate adjustment details.
    if (
      !Number.isSafeInteger(stockId) ||
      stockId <= 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      !['IN', 'OUT'].includes(direction) ||
      typeof notes !== 'string' ||
      !notes.trim() ||
      notes.trim().length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: 'Provide a valid stock ID, positive whole-number quantity, direction (IN or OUT), and adjustment notes (maximum 1000 characters).'
      });
    }

    if (
      role === 'OPERATIONS_MANAGER' &&
      !assignedSubsidiaryId
    ) {
      return res.status(403).json({
        success: false,
        message: 'No subsidiary is assigned to your account.'
      });
    }

    const result = await db.transaction(async (trx) => {
      let stockQuery = trx('inventory_stock')
        .where({ id: stockId });

      if (role === 'OPERATIONS_MANAGER') {
        stockQuery = stockQuery.where({
          subsidiary_id: assignedSubsidiaryId
        });
      }

      const stock = await stockQuery.first();

      if (!stock) {
        return {
          status: 404,
          message: 'Inventory stock record not found.'
        };
      }

      const quantityBefore = Number(stock.quantity_on_hand);

      if (
        !Number.isSafeInteger(quantityBefore) ||
        quantityBefore < 0
      ) {
        throw new Error('Invalid inventory quantity found.');
      }

      let quantityAfter;

      if (direction === 'IN') {
        if (quantityBefore > Number.MAX_SAFE_INTEGER - quantity) {
          return {
            status: 400,
            message: 'Stock adjustment exceeds the supported quantity limit.'
          };
        }

        quantityAfter = quantityBefore + quantity;

        await trx('inventory_stock')
          .where({ id: stockId })
          .increment('quantity_on_hand', quantity);
      } else {
        if (quantityBefore < quantity) {
          return {
            status: 400,
            message: 'Insufficient stock for this adjustment.'
          };
        }

        quantityAfter = quantityBefore - quantity;

        const updatedRows = await trx('inventory_stock')
          .where({ id: stockId })
          .where('quantity_on_hand', '>=', quantity)
          .decrement('quantity_on_hand', quantity);

        if (!updatedRows) {
          return {
            status: 400,
            message: 'Insufficient stock for this adjustment.'
          };
        }
      }

      // Record the adjustment in the permanent movement ledger.
      await trx('inventory_movements').insert({
        stock_id: stock.id,
        catalog_id: stock.catalog_id,
        subsidiary_id: stock.subsidiary_id,
        movement_type: direction === 'IN'
          ? 'ADJUSTMENT_IN'
          : 'ADJUSTMENT_OUT',
        quantity,
        quantity_before: quantityBefore,
        quantity_after: quantityAfter,
        reference_type: 'MANUAL_ADJUSTMENT',
        performed_by: req.user?.userId || null,
        notes: notes.trim()
      });

      return {
        status: 200,
        data: {
          stockId: stock.id,
          direction,
          quantityAdjusted: quantity,
          quantityBefore,
          quantityAfter,
          notes: notes.trim()
        }
      };
    });

    if (result.status !== 200) {
      return res.status(result.status).json({
        success: false,
        message: result.message
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Stock adjusted successfully.',
      data: result.data
    });

  } catch (error) {
    next(error);
  }
};
module.exports = {
  createCatalogItem,
  getInventoryStock,
  stockIn,
  adjustStock
};