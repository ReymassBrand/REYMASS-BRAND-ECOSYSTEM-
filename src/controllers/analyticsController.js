const knexfile = require('../../knexfile');
const db = require('knex')(knexfile.development);

// Consolidated Executive Dashboard Summary
const getExecutiveSummary = async (req, res, next) => {
  try {
    // 1. Revenue Rollup
    const totalInvoiced = await db('invoices').sum('total_amount as total').first();
    const paidInvoices = await db('invoices').where({ status: 'PAID' }).sum('total_amount as paid').first();
    const pendingInvoices = await db('invoices').where({ status: 'ISSUED' }).sum('total_amount as pending').first();

    // 2. Revenue Breakdown by Subsidiary
    const revenueBySubsidiary = await db('invoices')
      .join('subsidiaries', 'invoices.subsidiary_id', 'subsidiaries.id')
      .select('subsidiaries.code', 'subsidiaries.name')
      .sum('invoices.total_amount as total_invoiced')
      .select(db.raw('SUM(CASE WHEN invoices.status = "PAID" THEN invoices.total_amount ELSE 0 END) as total_paid'))
      .groupBy('subsidiaries.id', 'subsidiaries.code', 'subsidiaries.name');

    // 3. Work Order Operational Summary
    const workOrderStats = await db('work_orders')
      .select('status')
      .count('id as count')
      .groupBy('status');

    // 4. Low Stock Inventory Warnings
    const lowStockItems = await db('inventory_stock')
      .join('services_catalog', 'inventory_stock.catalog_id', 'services_catalog.id')
      .whereRaw('inventory_stock.quantity_on_hand <= inventory_stock.reorder_level')
      .select('services_catalog.item_code', 'services_catalog.name', 'inventory_stock.quantity_on_hand', 'inventory_stock.reorder_level');

    return res.status(200).json({
      success: true,
      data: {
        financials: {
          totalInvoiced: parseFloat(totalInvoiced.total || 0),
          totalPaid: parseFloat(paidInvoices.paid || 0),
          totalPending: parseFloat(pendingInvoices.pending || 0)
        },
        revenueBySubsidiary,
        workOrderStats,
        lowStockAlerts: lowStockItems
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExecutiveSummary
};