/**
 * REYMASS ONE - Customer 360 & CRM Controller
 * REYMASS BRAND INVESTMENT LTD
 */
const db = require('../db');

/**
 * Helper: Safely handles primary key insertion across SQLite, PostgreSQL, and MySQL
 */
const insertAndGetId = async (tableName, data) => {
  const clientName = db.client.config.client;
  
  if (clientName === 'sqlite3' || clientName === 'sqlite') {
    const insertResult = await db(tableName).insert(data);
    if (Array.isArray(insertResult)) {
      const first = insertResult[0];
      return typeof first === 'object' && first !== null ? (first.id || first[Object.keys(first)[0]]) : first;
    }
    return typeof insertResult === 'object' && insertResult !== null ? insertResult.id : insertResult;
  }

  // PostgreSQL / MySQL dialect handling
  const insertResult = await db(tableName).insert(data).returning('id');
  if (Array.isArray(insertResult)) {
    const first = insertResult[0];
    return typeof first === 'object' && first !== null ? first.id : first;
  }
  if (typeof insertResult === 'object' && insertResult !== null) {
    return insertResult.id;
  }
  return insertResult;
};

// --- 1. Core Customer CRUD ---

const getCustomers = async (req, res, next) => {
  try {
    const customers = await db('customers').select('*').whereNot({ status: 'DELETED' });
    return res.status(200).json({
      success: true,
      data: customers
    });
  } catch (error) {
    next(error);
  }
};

const createCustomer = async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone are required.'
      });
    }

   const year = new Date().getFullYear();
let id = null;
let lastError = null;

// Retry account-number generation if a concurrent request
// attempts to create the same account number.
for (let attempt = 0; attempt < 5; attempt++) {
  const existingAccounts = await db('customers')
    .where('account_number', 'like', `CUST-${year}-%`)
    .select('account_number');

  let highestSequence = 0;

  for (const account of existingAccounts) {
    const match = account.account_number.match(
      new RegExp(`^CUST-${year}-(\\d+)$`)
    );

    if (match) {
      highestSequence = Math.max(
        highestSequence,
        Number(match[1])
      );
    }
  }

  const nextSequence = String(highestSequence + 1)
    .padStart(5, '0');

  const accountNumber = `CUST-${year}-${nextSequence}`;

  try {
    id = await insertAndGetId('customers', {
      ...req.body,
      account_number: accountNumber
    });

    break;
  } catch (error) {
    lastError = error;

    const errorMessage = String(error.message || '');

    // An existing email is a customer conflict, not a
    // reason to generate another account number.
    if (errorMessage.includes('customers.email')) {
      return res.status(409).json({
        success: false,
        message: 'A customer with this email address already exists.'
      });
    }

    // If another request claimed this number, try again.
    if (
      errorMessage.includes('customers.account_number') &&
      attempt < 4
    ) {
      continue;
    }

    throw error;
  }
}

if (id === null || id === undefined) {
  if (lastError) throw lastError;

  return res.status(500).json({
    success: false,
    message: 'Could not generate a customer account number.'
  });
}

    const created = await db('customers').where({ id }).first();

    if (!created) {
      return res.status(500).json({
        success: false,
        message: 'Customer insert completed, but the record could not be retrieved.'
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: created
    });
  } catch (error) {
    console.error('Customer creation error:', error.message);
    next(error);
  }
};

const getCustomerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const customer = await db('customers').where({ id }).first();

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' }
      });
    }

    return res.status(200).json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
};
const updateCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Confirm the customer exists.
    const existing = await db('customers')
      .where({ id })
      .first();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CUSTOMER_NOT_FOUND',
          message: 'Customer not found.'
        }
      });
    }

    // Only allow explicitly approved fields to be changed.
    const allowedFields = [
      'account_type',
      'name',
      'company_name',
      'email',
      'phone',
      'national_id_or_tax',
      'address',
      'city',
      'country',
      'primary_subsidiary_id'
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          field
        )
      ) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid customer fields were provided for update.'
      });
    }

    // Protect fields such as account_number, id and status.
    updates.updated_at = new Date();

    await db('customers')
      .where({ id })
      .update(updates);

    const updated = await db('customers')
      .where({ id })
      .first();

    return res.status(200).json({
      success: true,
      message: 'Customer updated successfully.',
      data: updated
    });
  } catch (error) {
    // SQLite unique email violations and similar conflicts.
    if (
      error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      error.code === 'SQLITE_CONSTRAINT'
    ) {
      return res.status(409).json({
        success: false,
        message: 'The supplied email address may already belong to another customer.'
      });
    }

    next(error);
  }
};
const deactivateCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db('customers').where({ id }).first();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' }
      });
    }

    await db('customers').where({ id }).update({
      status: 'INACTIVE',
      updated_at: new Date()
    });

    try {
      if (typeof req.logAudit === 'function') {
        await req.logAudit('CUSTOMER_DEACTIVATED', id, { previous_status: existing.status });
      }
    } catch (auditErr) {
      console.warn('Non-blocking audit log warning:', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Customer deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
};

// --- 2. Central Customer 360 Aggregation ---

const getCustomer360 = async (req, res, next) => {
  try {
    const { id } = req.params;

    const customer = await db('customers')
      .where({ id })
      .first();

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CUSTOMER_NOT_FOUND',
          message: 'Customer not found'
        }
      });
    }

    // Never expose credentials if these fields are added in the future.
    delete customer.password;
    delete customer.password_hash;

    const [
      subsidiaries,
      contacts,
      addresses,
      services,
      quotations,
      invoices,
      payments,
      workOrders,
      notes,
      leads,
      opportunities,
      auditActivities
    ] = await Promise.all([
      db('customer_subsidiaries')
        .join(
          'subsidiaries',
          'customer_subsidiaries.subsidiary_id',
          'subsidiaries.id'
        )
        .where('customer_subsidiaries.customer_id', id)
        .select(
          'subsidiaries.id',
          'subsidiaries.code',
          'subsidiaries.name',
          'customer_subsidiaries.is_primary',
          'customer_subsidiaries.is_active'
        ),

      db('customer_contacts')
        .where({ customer_id: id }),

      db('customer_addresses')
        .where({ customer_id: id }),

      db('customer_services')
        .leftJoin(
          'services_catalog',
          'customer_services.catalog_id',
          'services_catalog.id'
        )
        .where('customer_services.customer_id', id)
        .select(
          'customer_services.*',
          'services_catalog.name as catalog_item_name'
        ),

      db('quotations')
        .where({ customer_id: id }),

      db('invoices')
        .where({ customer_id: id }),

      // Payments are linked to customers through their invoices.
      db('payments')
        .join('invoices', 'payments.invoice_id', 'invoices.id')
        .where('invoices.customer_id', id)
        .select('payments.*'),

      db('work_orders')
        .where({ customer_id: id }),

      // The actual database column is "note", not "content".
      db('customer_notes')
        .leftJoin('users', 'customer_notes.created_by', 'users.id')
        .where('customer_notes.customer_id', id)
        .select(
          'customer_notes.*',
          'users.name as author_name'
        ),

      db('leads')
        .where({ customer_id: id }),

      db('sales_opportunities')
        .where({ customer_id: id }),

      // Match the real audit-log schema.
      db('audit_logs')
        .where('entity_id', String(id))
        .whereIn(
          db.client.raw('LOWER(??)', ['entity_name']),
          ['customer', 'customers']
        )
        .orderBy('created_at', 'desc')
        .limit(10)
    ]);

    // There is currently no receipts table in the database.
    // Keep the API response consistent without querying a missing table.
    const receipts = [];

    // Financial summary
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;

    invoices.forEach(invoice => {
      const total = Number(invoice.total_amount || 0);
      const paid = Number(invoice.amount_paid || 0);

      totalInvoiced += total;
      totalPaid += paid;

      // Prefer the stored balance when available.
      const balance = invoice.balance_due !== undefined &&
        invoice.balance_due !== null
        ? Number(invoice.balance_due)
        : Math.max(0, total - paid);

      totalOutstanding += Math.max(0, balance);
    });

    const summary = {
      total_quotations: quotations.length,

      pending_quotations: quotations.filter(quotation =>
        ['DRAFT', 'SENT', 'PENDING'].includes(
          String(quotation.status || '').toUpperCase()
        )
      ).length,

      total_invoiced: Number(totalInvoiced.toFixed(2)),
      total_paid: Number(totalPaid.toFixed(2)),
      total_outstanding: Number(totalOutstanding.toFixed(2)),

      active_services: services.filter(service =>
        String(service.status || '').toUpperCase() === 'ACTIVE'
      ).length,

      open_work_orders: workOrders.filter(workOrder =>
        !['COMPLETED', 'CANCELLED'].includes(
          String(workOrder.status || '').toUpperCase()
        )
      ).length,

      open_opportunities: opportunities.filter(opportunity =>
        !['CLOSED_WON', 'CLOSED_LOST'].includes(
          String(opportunity.stage || '').toUpperCase()
        )
      ).length
    };

    // Combine recent events into one activity timeline.
    const recentActivity = [];

    auditActivities.forEach(log => {
      recentActivity.push({
        type: 'AUDIT_LOG',
        title: log.action || 'Customer activity',
        description: log.new_values || log.old_values || log.entity_name,
        timestamp: log.created_at
      });
    });

    notes.forEach(note => {
      recentActivity.push({
        type: 'NOTE',
        title: note.is_important
          ? 'Important Note Added'
          : 'Note Added',
        description: note.note,
        timestamp: note.created_at
      });
    });

    workOrders.forEach(workOrder => {
      recentActivity.push({
        type: 'WORK_ORDER',
        title: `Work Order ${
          workOrder.work_order_number || '#' + workOrder.id
        }`,
        description: `${workOrder.title || 'Work order'} - Status: ${
          workOrder.status || 'UNKNOWN'
        }`,
        timestamp: workOrder.created_at
      });
    });

    recentActivity.sort((a, b) => {
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });

    return res.status(200).json({
      success: true,
      customer,
      subsidiaries,
      contacts,
      addresses,
      services,
      quotations,
      invoices,
      payments,
      receipts,
      work_orders: workOrders,
      notes,
      leads,
      opportunities,
      summary,
      recent_activity: recentActivity.slice(0, 15)
    });
  } catch (error) {
    next(error);
  }
};
    


const createCustomerNote = async (req, res, next) => {
  try {
    const id = await insertAndGetId('customer_notes', { customer_id: req.params.id, ...req.body });
    res.status(201).json({ success: true, data: { id } });
  } catch (err) { next(err); }
};

const updateCustomerNote = async (req, res, next) => {
  try {
    await db('customer_notes').where({ id: req.params.noteId, customer_id: req.params.id }).update(req.body);
    res.status(200).json({ success: true, message: 'Note updated' });
  } catch (err) { next(err); }
};

const deleteCustomerNote = async (req, res, next) => {
  try {
    await db('customer_notes').where({ id: req.params.noteId, customer_id: req.params.id }).del();
    res.status(200).json({ success: true, message: 'Contact deleted' });
  } catch (err) { next(err); }
};

const getCustomerServices = async (req, res, next) => {
  try {
    const services = await db('customer_services').where({ customer_id: req.params.id });
    res.status(200).json({ success: true, data: services });
  } catch (err) { next(err); }
};

const createCustomerService = async (req, res, next) => {
  try {
    const id = await insertAndGetId('customer_services', { customer_id: req.params.id, ...req.body });
    res.status(201).json({ success: true, data: { id } });
  } catch (err) { next(err); }
};

const updateCustomerServiceStatus = async (req, res, next) => {
  try {
    await db('customer_services').where({ id: req.params.serviceId, customer_id: req.params.id }).update({ status: req.body.status });
    res.status(200).json({ success: true, message: 'Service status updated' });
  } catch (err) { next(err); }
};

module.exports = {
  getCustomers,
  createCustomer,
  getCustomer360,
  getCustomerById,
  updateCustomer,
  deactivateCustomer,
  getCustomerSubsidiaries,
  addCustomerSubsidiary,
  removeCustomerSubsidiary,
  getCustomerContacts,
  createCustomerContact,
  updateCustomerContact,
  deleteCustomerContact,
  getCustomerAddresses,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  getCustomerNotes,
  createCustomerNote,
  updateCustomerNote,
  deleteCustomerNote,
  getCustomerServices,
  createCustomerService,
  updateCustomerServiceStatus
};