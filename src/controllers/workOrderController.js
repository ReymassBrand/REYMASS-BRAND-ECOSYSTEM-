const crypto = require('crypto');
const db = require('../db');

const GLOBAL_ROLES = ['SUPER_ADMIN', 'CEO', 'FINANCE'];
const SUBSIDIARY_ROLES = ['OPERATIONS_MANAGER', 'SALES'];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const isPositiveInteger = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0;

const getInsertedId = (result) => {
  if (Array.isArray(result)) {
    return typeof result[0] === 'object'
      ? result[0].id
      : result[0];
  }

  return result;
};

const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};
// Validate and normalize an ISO 8601 date with an explicit timezone.
const normalizeScheduledDate = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const dateValue = value.trim();

  const isoWithTimezone =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

  const match = dateValue.match(isoWithTimezone);

  if (!match) {
    return null;
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    ,
    timezone,
    ,
    offsetHour,
    offsetMinute
  ] = match;

  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const min = Number(minute);
  const sec = Number(second);

  if (
    m < 1 ||
    m > 12 ||
    h > 23 ||
    min > 59 ||
    sec > 59
  ) {
    return null;
  }

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  if (d < 1 || d > daysInMonth) {
    return null;
  }

  if (timezone !== 'Z') {
    const tzHour = Number(offsetHour);
    const tzMinute = Number(offsetMinute);

    if (
      tzHour > 14 ||
      tzMinute > 59 ||
      (tzHour === 14 && tzMinute !== 0)
    ) {
      return null;
    }
  }

  const timestamp = Date.parse(dateValue);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
};
const handleError = (error, res, next) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }

  return next(error);
};
// Generate a unique work-order reference.
const generateWorkOrderNumber = () => {
  const date = new Date().toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);

  const random = crypto.randomBytes(4).toString('hex').toUpperCase();

  return `WO-${date}-${random}`;
};

// CREATE WORK ORDER
const createWorkOrder = async (req, res, next) => {
  try {
        const {
      customerId,
      subsidiaryId,
      title,
      description,
      priority,
      assignedSpecialistId,
      scheduledDate
    } = req.body;

    let normalizedScheduledDate = null;

    if (
      scheduledDate !== undefined &&
      scheduledDate !== null &&
      scheduledDate !== ''
    ) {
      normalizedScheduledDate = normalizeScheduledDate(scheduledDate);

      if (!normalizedScheduledDate) {
        return res.status(400).json({
          success: false,
          message: 'Invalid scheduled date. Provide a valid ISO 8601 date with timezone, for example 2026-11-05T09:00:00+03:00.'
        });
      }

      if (!isPositiveInteger(req.user?.userId)) {
        return res.status(400).json({
          success: false,
          message: 'A valid authenticated user is required to record the schedule.'
        });
      }
    }
    const role = String(req.user?.role || '').toUpperCase();
    const userSubsidiaryId = req.user?.subsidiaryId;

    if (!isPositiveInteger(customerId) || !title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A valid customer ID and work-order title are required.'
      });
    }

    if (!['SUPER_ADMIN', 'OPERATIONS_MANAGER'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to create work orders.'
      });
    }

    let targetSubsidiaryId;

    if (role === 'OPERATIONS_MANAGER') {
      if (!isPositiveInteger(userSubsidiaryId)) {
        return res.status(403).json({
          success: false,
          message: 'Your account is not assigned to a subsidiary.'
        });
      }

      if (
        subsidiaryId &&
        Number(subsidiaryId) !== Number(userSubsidiaryId)
      ) {
        return res.status(403).json({
          success: false,
          message: 'You cannot create work orders for another subsidiary.'
        });
      }

      targetSubsidiaryId = Number(userSubsidiaryId);
    } else {
      if (!isPositiveInteger(subsidiaryId)) {
        return res.status(400).json({
          success: false,
          message: 'A valid subsidiary ID is required.'
        });
      }

      targetSubsidiaryId = Number(subsidiaryId);
    }

    const customer = await db('customers')
      .where({ id: Number(customerId) })
      .first();

    if (!customer || customer.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Customer does not exist or is inactive.'
      });
    }

    const subsidiary = await db('subsidiaries')
      .where({ id: targetSubsidiaryId })
      .first();

    if (!subsidiary || !subsidiary.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Subsidiary does not exist or is inactive.'
      });
    }

    let specialistId = null;

    if (assignedSpecialistId !== undefined &&
        assignedSpecialistId !== null &&
        assignedSpecialistId !== '') {

      if (!isPositiveInteger(assignedSpecialistId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid specialist ID.'
        });
      }

      const specialist = await db('users')
        .join('roles', 'users.role_id', 'roles.id')
        .where('users.id', Number(assignedSpecialistId))
        .select(
          'users.id',
          'users.subsidiary_id',
          'users.is_active',
          'roles.name as role_name'
        )
        .first();

      if (
        !specialist ||
        !specialist.is_active ||
        specialist.role_name !== 'SPECIALIST' ||
        Number(specialist.subsidiary_id) !== targetSubsidiaryId
      ) {
        return res.status(400).json({
          success: false,
          message: 'Specialist must be active and belong to the work-order subsidiary.'
        });
      }

      specialistId = specialist.id;
    }

    const normalizedPriority = String(priority || 'MEDIUM')
      .trim()
      .toUpperCase();

    if (!VALID_PRIORITIES.includes(normalizedPriority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid work-order priority.'
      });
    }

    const workOrderNumber = generateWorkOrderNumber();

    const status = specialistId ? 'ASSIGNED' : 'PENDING';
const workOrderId = await db.transaction(async (trx) => {
  const result = await trx('work_orders')
    .insert({
      work_order_number: workOrderNumber,
      customer_id: Number(customerId),
      subsidiary_id: targetSubsidiaryId,
      assigned_specialist_id: specialistId,
      title: title.trim(),
      description: description || null,
      priority: normalizedPriority,
      status,
      scheduled_date: normalizedScheduledDate
    })
    .returning('id');

  const id = getInsertedId(result);

  if (normalizedScheduledDate) {
    await trx('work_order_schedule_history').insert({
      work_order_id: id,
      previous_scheduled_date: null,
      new_scheduled_date: normalizedScheduledDate,
      changed_by_user_id: Number(req.user.userId),
      reason: 'Initial schedule at work-order creation'
    });
  }

  return id;
});
    return res.status(201).json({
      success: true,
      message: 'Work order created successfully.',
      data: {
        id: workOrderId,
        workOrderNumber,
        status
      }
    });

  } catch (error) {
    return handleError(error, res, next);
  }
};

// GET WORK ORDERS WITH ROLE-BASED ACCESS CONTROL
const getWorkOrders = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toUpperCase();
    const subsidiaryId = req.user?.subsidiaryId;
    const userId = req.user?.userId;

    let query = db('work_orders')
      .join('customers', 'work_orders.customer_id', 'customers.id')
      .join('subsidiaries', 'work_orders.subsidiary_id', 'subsidiaries.id')
      .select(
        'work_orders.id',
        'work_orders.work_order_number',
        'work_orders.title',
        'work_orders.description',
        'work_orders.priority',
        'work_orders.status',
        'work_orders.scheduled_date',
        'work_orders.customer_id',
        'work_orders.subsidiary_id',
        'work_orders.assigned_specialist_id',
        'customers.name as customer_name',
        'subsidiaries.code as subsidiary_code'
      );

    if (GLOBAL_ROLES.includes(role)) {
      // Global visibility.
    } else if (SUBSIDIARY_ROLES.includes(role)) {

      if (!isPositiveInteger(subsidiaryId)) {
        return res.status(403).json({
          success: false,
          message: 'Your account is not assigned to a subsidiary.'
        });
      }

      query = query.where(
        'work_orders.subsidiary_id',
        Number(subsidiaryId)
      );

    } else if (role === 'SPECIALIST') {

      if (
        !isPositiveInteger(userId) ||
        !isPositiveInteger(subsidiaryId)
      ) {
        return res.status(403).json({
          success: false,
          message: 'Invalid specialist account information.'
        });
      }

      query = query
        .where('work_orders.subsidiary_id', Number(subsidiaryId))
        .where('work_orders.assigned_specialist_id', Number(userId));

    } else {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view work orders.'
      });
    }

    const orders = await query.orderBy('work_orders.id', 'desc');

    return res.status(200).json({
      success: true,
      data: orders
    });

  } catch (error) {
    return next(error);
  }
};

// ALLOCATE MATERIAL TO WORK ORDER
const allocateMaterialToWorkOrder = async (req, res, next) => {
  try {
    const { workOrderId, catalogItemId, quantity } = req.body;

    const role = String(req.user?.role || '').toUpperCase();
    const userId = req.user?.userId;
    const subsidiaryId = req.user?.subsidiaryId;

    if (
      !isPositiveInteger(workOrderId) ||
      !isPositiveInteger(catalogItemId) ||
      !isPositiveInteger(quantity)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid work order ID, catalog item ID and positive integer quantity are required.'
      });
    }

    if (
      !['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'SPECIALIST'].includes(role)
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to allocate materials.'
      });
    }

    const allocation = await db.transaction(async (trx) => {

      const workOrder = await trx('work_orders')
        .where({ id: Number(workOrderId) })
        .first();

      if (!workOrder) {
        throw httpError(404, 'Work order not found.');
      }
      const workOrderStatus = String(workOrder.status || '').toUpperCase();

      if (['COMPLETED', 'CANCELLED'].includes(workOrderStatus)) {
        throw httpError(
          400,
          `Materials cannot be allocated to a ${workOrderStatus.toLowerCase()} work order.`
        );
      }
      if (role !== 'SUPER_ADMIN') {

        if (
          !isPositiveInteger(subsidiaryId) ||
          Number(workOrder.subsidiary_id) !== Number(subsidiaryId)
        ) {
          throw httpError(403, 'You cannot allocate materials to another subsidiary.');
        }

        if (
          role === 'SPECIALIST' &&
          Number(workOrder.assigned_specialist_id) !== Number(userId)
        ) {
          throw httpError(403, 'You can only allocate materials to work orders assigned to you.');
        }
      }

      const stock = await trx('inventory_stock')
        .join(
          'services_catalog',
          'inventory_stock.catalog_id',
          'services_catalog.id'
        )
        .where({
          'inventory_stock.catalog_id': Number(catalogItemId),
          'inventory_stock.subsidiary_id': workOrder.subsidiary_id,
          'services_catalog.item_type': 'PRODUCT',
          'services_catalog.is_active': true
        })
        .select(
          'inventory_stock.id as stock_id',
          'inventory_stock.quantity_on_hand',
          'inventory_stock.warehouse_location',
          'inventory_stock.subsidiary_id',
          'services_catalog.id as catalog_id',
          'services_catalog.item_code',
          'services_catalog.name as item_name'
        )
        .first();

      if (!stock) {
        throw httpError(400, 'Product stock not found in the work-order subsidiary.');
      }

      const requestedQuantity = Number(quantity);

      if (Number(stock.quantity_on_hand) < requestedQuantity) {
        throw httpError(
          400,
          `Insufficient stock. Available quantity: ${stock.quantity_on_hand}`
        );
      }

      // Conditional deduction protects against overselling stock.
      const updatedRows = await trx('inventory_stock')
        .where({ id: stock.stock_id })
        .where('quantity_on_hand', '>=', requestedQuantity)
        .decrement('quantity_on_hand', requestedQuantity);

      if (Number(updatedRows) !== 1) {
        throw httpError(400, 'Stock changed during allocation. Please try again.');
      }

      // Record the allocation in the permanent audit history.
      await trx('material_allocations').insert({
        work_order_id: Number(workOrderId),
        catalog_id: stock.catalog_id,
        stock_id: stock.stock_id,
        subsidiary_id: stock.subsidiary_id,
        allocated_by_user_id: Number(userId),
        quantity: requestedQuantity,
        item_code: stock.item_code,
        item_name: stock.item_name,
        warehouse_location: stock.warehouse_location || null
      });

      const updatedStock = await trx('inventory_stock')
        .where({ id: stock.stock_id })
        .first();
// Record the stock deduction in the permanent movement ledger.
const quantityAfter = Number(updatedStock.quantity_on_hand);
const quantityBefore = quantityAfter + requestedQuantity;

await trx('inventory_movements').insert({
  stock_id: stock.stock_id,
  catalog_id: stock.catalog_id,
  subsidiary_id: stock.subsidiary_id,
  movement_type: 'WORK_ORDER_ALLOCATION',
  quantity: requestedQuantity,
  quantity_before: quantityBefore,
  quantity_after: quantityAfter,
  reference_type: 'WORK_ORDER',
  reference_id: Number(workOrderId),
  performed_by: Number(userId),
  notes: `Materials allocated to work order ${workOrderId}.`
});
      return {
        catalogItemId: Number(catalogItemId),
        allocatedQuantity: requestedQuantity,
        remainingStock: updatedStock.quantity_on_hand,
        workOrderId: Number(workOrderId)
      };
    });

    return res.status(200).json({
      success: true,
      message: `Successfully allocated ${allocation.allocatedQuantity} unit(s) to work order ${allocation.workOrderId}.`,
      data: allocation
    });

  } catch (error) {
    return handleError(error, res, next);
  }
};
/**
 * Update work-order status and record lifecycle history.
 *
 * Lifecycle:
 * PENDING -> ASSIGNED
 * ASSIGNED -> IN_PROGRESS
 * IN_PROGRESS -> COMPLETED
 * PENDING / ASSIGNED / IN_PROGRESS -> CANCELLED
 */
const updateWorkOrderStatus = async (req, res, next) => {
  const trx = await db.transaction();

  try {
    const workOrderId = req.params.id;
    const {
      newStatus,
      assignedSpecialistId,
      notes
    } = req.body;

    const { userId, role, subsidiaryId } = req.user;

    if (!isPositiveInteger(workOrderId)) {
      throw httpError(400, 'Invalid work order ID.');
    }

    if (!['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(newStatus)) {
      throw httpError(400, 'Invalid work-order status.');
    }

    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) {
      throw httpError(400, 'Notes must be text not exceeding 1000 characters.');
    }

    if (!isPositiveInteger(userId)) {
      throw httpError(401, 'Invalid authenticated user.');
    }

    const workOrder = await trx('work_orders')
      .where({ id: Number(workOrderId) })
      .first();

    if (!workOrder) {
      throw httpError(404, 'Work order not found.');
    }

    const isSuperAdmin = role === 'SUPER_ADMIN';
    const isOperationsManager = role === 'OPERATIONS_MANAGER';
    const isSpecialist = role === 'SPECIALIST';

    if (!isSuperAdmin && !isOperationsManager && !isSpecialist) {
      throw httpError(403, 'You are not allowed to update work-order status.');
    }

    if (!isSuperAdmin && Number(workOrder.subsidiary_id) !== Number(subsidiaryId)) {
      throw httpError(403, 'You cannot update a work order outside your subsidiary.');
    }

    const previousStatus = workOrder.status;
    const targetStatus = newStatus;

    if (['COMPLETED', 'CANCELLED'].includes(previousStatus)) {
      throw httpError(400, 'Completed or cancelled work orders cannot be changed.');
    }

    // Assignment: Operations Manager or Super Admin.
    if (targetStatus === 'ASSIGNED') {
      if (!isOperationsManager && !isSuperAdmin) {
        throw httpError(403, 'Only an Operations Manager or Super Admin can assign work orders.');
      }

      if (previousStatus !== 'PENDING') {
        throw httpError(400, 'Only pending work orders can be assigned.');
      }

      if (!isPositiveInteger(assignedSpecialistId)) {
        throw httpError(400, 'A valid assignedSpecialistId is required.');
      }

      const specialist = await trx('users')
        .join('roles', 'users.role_id', 'roles.id')
        .where('users.id', Number(assignedSpecialistId))
        .where('users.is_active', true)
        .where('roles.name', 'SPECIALIST')
        .first('users.id', 'users.subsidiary_id');

      if (!specialist) {
        throw httpError(400, 'The selected specialist is invalid or inactive.');
      }

      if (Number(specialist.subsidiary_id) !== Number(workOrder.subsidiary_id)) {
        throw httpError(400, 'The specialist must belong to the work order subsidiary.');
      }
    }

    // Starting work: assigned Specialist.
    else if (targetStatus === 'IN_PROGRESS') {
      if (previousStatus !== 'ASSIGNED') {
        throw httpError(400, 'Only assigned work orders can be started.');
      }

      if (!isSpecialist && !isSuperAdmin) {
        throw httpError(403, 'Only the assigned Specialist or Super Admin can start the work.');
      }

      if (
        !isSuperAdmin &&
        Number(workOrder.assigned_specialist_id) !== Number(userId)
      ) {
        throw httpError(403, 'You can only start work orders assigned to you.');
      }
    }

    // Completion: Operations Manager or Super Admin.
    else if (targetStatus === 'COMPLETED') {
      if (previousStatus !== 'IN_PROGRESS') {
        throw httpError(400, 'Only work orders in progress can be completed.');
      }

      if (!isOperationsManager && !isSuperAdmin) {
        throw httpError(403, 'Only an Operations Manager or Super Admin can complete work orders.');
      }
    }

    // Cancellation: Operations Manager or Super Admin.
    else if (targetStatus === 'CANCELLED') {
      if (!['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(previousStatus)) {
        throw httpError(400, 'This work order cannot be cancelled.');
      }

      if (!isOperationsManager && !isSuperAdmin) {
        throw httpError(403, 'Only an Operations Manager or Super Admin can cancel work orders.');
      }
    }

    const updateData = {
      status: targetStatus,
      updated_at: trx.fn.now()
    };

    if (targetStatus === 'ASSIGNED') {
      updateData.assigned_specialist_id = Number(assignedSpecialistId);
    }

    if (targetStatus === 'COMPLETED') {
      updateData.completed_at = trx.fn.now();
    }

    // Conditional update protects against simultaneous status changes.
    const updatedRows = await trx('work_orders')
      .where({ id: Number(workOrderId), status: previousStatus })
      .update(updateData);

    if (updatedRows !== 1) {
      throw httpError(409, 'The work order status has changed. Refresh and try again.');
    }

    await trx('work_order_status_history').insert({
      work_order_id: Number(workOrderId),
      previous_status: previousStatus,
      new_status: targetStatus,
      changed_by_user_id: Number(userId),
      notes: notes ? notes.trim() : null,
      created_at: trx.fn.now()
    });

    await trx.commit();

    return res.status(200).json({
      success: true,
      message: `Work order status updated from ${previousStatus} to ${targetStatus}.`,
      data: {
        workOrderId: Number(workOrderId),
        previousStatus,
        newStatus: targetStatus,
        assignedSpecialistId: targetStatus === 'ASSIGNED'
          ? Number(assignedSpecialistId)
          : workOrder.assigned_specialist_id,
        notes: notes ? notes.trim() : null
      }
    });

  } catch (error) {
    await trx.rollback();
    return handleError(error, res, next);
  }
};
// SHARED WORK-ORDER ACCESS CHECK
const getAccessibleWorkOrder = async (workOrderId, user) => {
  const role = String(user?.role || '').toUpperCase();
  const subsidiaryId = user?.subsidiaryId;
  const userId = user?.userId;

  let query = db('work_orders')
    .where('work_orders.id', Number(workOrderId));

  if (GLOBAL_ROLES.includes(role)) {
    // Global roles can access all subsidiaries.
  } else if (SUBSIDIARY_ROLES.includes(role)) {
    if (!isPositiveInteger(subsidiaryId)) {
      throw httpError(403, 'Your account is not assigned to a subsidiary.');
    }

    query = query.where(
      'work_orders.subsidiary_id',
      Number(subsidiaryId)
    );
  } else if (role === 'SPECIALIST') {
    if (
      !isPositiveInteger(userId) ||
      !isPositiveInteger(subsidiaryId)
    ) {
      throw httpError(403, 'Invalid specialist account information.');
    }

    query = query
      .where('work_orders.subsidiary_id', Number(subsidiaryId))
      .where('work_orders.assigned_specialist_id', Number(userId));
  } else {
    throw httpError(403, 'You are not authorized to view this work order.');
  }

  const workOrder = await query.first();

  if (!workOrder) {
    throw httpError(404, 'Work order not found.');
  }

  return workOrder;
};


// GET INDIVIDUAL WORK ORDER DETAILS
const getWorkOrderById = async (req, res, next) => {
  try {
    if (!isPositiveInteger(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'A valid work order ID is required.'
      });
    }

    const workOrder = await getAccessibleWorkOrder(
      req.params.id,
      req.user
    );

    const details = await db('work_orders')
      .join('customers', 'work_orders.customer_id', 'customers.id')
      .join('subsidiaries', 'work_orders.subsidiary_id', 'subsidiaries.id')
      .leftJoin(
        'users as specialists',
        'work_orders.assigned_specialist_id',
        'specialists.id'
      )
      .where('work_orders.id', workOrder.id)
      .select(
        'work_orders.*',
        'customers.name as customer_name',
        'customers.email as customer_email',
        'customers.phone as customer_phone',
        'customers.account_number as customer_account_number',
        'subsidiaries.code as subsidiary_code',
        'specialists.id as specialist_id',
        'specialists.first_name as specialist_first_name',
        'specialists.last_name as specialist_last_name',
        'specialists.email as specialist_email',
        'specialists.phone as specialist_phone'
      )
      .first();

    const materials = await db('material_allocations')
      .leftJoin(
        'users as allocators',
        'material_allocations.allocated_by_user_id',
        'allocators.id'
      )
      .where('material_allocations.work_order_id', workOrder.id)
      .select(
        'material_allocations.*',
        'allocators.first_name as allocated_by_first_name',
        'allocators.last_name as allocated_by_last_name'
      )
      .orderBy('material_allocations.created_at', 'asc');

    const statusHistory = await db('work_order_status_history')
      .leftJoin(
        'users as changers',
        'work_order_status_history.changed_by_user_id',
        'changers.id'
      )
      .where('work_order_status_history.work_order_id', workOrder.id)
      .select(
        'work_order_status_history.*',
        'changers.first_name as changed_by_first_name',
        'changers.last_name as changed_by_last_name'
      )
      .orderBy('work_order_status_history.created_at', 'asc')
      .orderBy('work_order_status_history.id', 'asc');
    const scheduleHistory = await db('work_order_schedule_history')
      .leftJoin(
        'users as changers',
        'work_order_schedule_history.changed_by_user_id',
        'changers.id'
      )
      .where('work_order_schedule_history.work_order_id', workOrder.id)
      .select(
        'work_order_schedule_history.*',
        'changers.first_name as changed_by_first_name',
        'changers.last_name as changed_by_last_name',
        'changers.email as changed_by_email'
      )
      .orderBy('work_order_schedule_history.created_at', 'asc')
      .orderBy('work_order_schedule_history.id', 'asc');
    return res.status(200).json({
      success: true,
      data: {
        ...details,
        assigned_specialist: details.specialist_id
          ? {
              id: details.specialist_id,
              first_name: details.specialist_first_name,
              last_name: details.specialist_last_name,
              email: details.specialist_email,
              phone: details.specialist_phone
            }
          : null,
                materials,
        status_history: statusHistory,
        schedule_history: scheduleHistory
      }
    });

  } catch (error) {
    return handleError(error, res, next);
  }
};
// RESCHEDULE WORK ORDER
const rescheduleWorkOrder = async (req, res, next) => {
  try {
    const workOrderId = req.params.id;
    const { scheduledDate, reason } = req.body;

    if (!isPositiveInteger(workOrderId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid work order ID is required.'
      });
    }

    const role = String(req.user?.role || '').toUpperCase();
    const userId = req.user?.userId;
    const subsidiaryId = req.user?.subsidiaryId;

    if (!['SUPER_ADMIN', 'OPERATIONS_MANAGER'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reschedule work orders.'
      });
    }

    if (!isPositiveInteger(userId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid authenticated user is required.'
      });
    }

    if (role === 'OPERATIONS_MANAGER' && !isPositiveInteger(subsidiaryId)) {
      return res.status(403).json({
        success: false,
        message: 'Your account is not assigned to a subsidiary.'
      });
    }

    const normalizedScheduledDate = normalizeScheduledDate(scheduledDate);

    if (!normalizedScheduledDate) {
      return res.status(400).json({
        success: false,
        message: 'Provide a valid ISO 8601 scheduled date with timezone.'
      });
    }

    if (typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A reason for rescheduling is required.'
      });
    }

    const result = await db.transaction(async (trx) => {
      let query = trx('work_orders')
        .where({ id: Number(workOrderId) });

      if (role === 'OPERATIONS_MANAGER') {
        query = query.where(
          'subsidiary_id',
          Number(subsidiaryId)
        );
      }

      const workOrder = await query.first();

      if (!workOrder) {
        throw httpError(404, 'Work order not found.');
      }

      if (!['PENDING', 'ASSIGNED'].includes(workOrder.status)) {
        throw httpError(
          409,
          'Only PENDING or ASSIGNED work orders can be rescheduled.'
        );
      }

      if (
        workOrder.scheduled_date &&
        new Date(workOrder.scheduled_date).toISOString() === normalizedScheduledDate
      ) {
        throw httpError(
          400,
          'The new scheduled date must be different from the current date.'
        );
      }

      const previousScheduledDate = workOrder.scheduled_date || null;

      const updated = await trx('work_orders')
        .where({ id: workOrder.id })
        .whereIn('status', ['PENDING', 'ASSIGNED'])
        .update({
          scheduled_date: normalizedScheduledDate,
          updated_at: trx.fn.now()
        });

      if (updated !== 1) {
        throw httpError(
          409,
          'The work order could not be rescheduled. Please reload and try again.'
        );
      }

      await trx('work_order_schedule_history').insert({
        work_order_id: workOrder.id,
        previous_scheduled_date: previousScheduledDate,
        new_scheduled_date: normalizedScheduledDate,
        changed_by_user_id: Number(userId),
        reason: reason.trim()
      });

      return {
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.work_order_number,
        previousScheduledDate,
        scheduledDate: normalizedScheduledDate
      };
    });

    return res.status(200).json({
      success: true,
      message: 'Work order rescheduled successfully.',
      data: result
    });

  } catch (error) {
    return handleError(error, res, next);
  }
};

// GET WORK-ORDER STATUS HISTORY
const getWorkOrderHistory = async (req, res, next) => {
  try {
    if (!isPositiveInteger(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'A valid work order ID is required.'
      });
    }

    const workOrder = await getAccessibleWorkOrder(
      req.params.id,
      req.user
    );

    const history = await db('work_order_status_history')
      .leftJoin(
        'users as changers',
        'work_order_status_history.changed_by_user_id',
        'changers.id'
      )
      .where('work_order_status_history.work_order_id', workOrder.id)
      .select(
        'work_order_status_history.*',
        'changers.first_name as changed_by_first_name',
        'changers.last_name as changed_by_last_name',
        'changers.email as changed_by_email'
      )
      .orderBy('work_order_status_history.created_at', 'asc')
      .orderBy('work_order_status_history.id', 'asc');

    return res.status(200).json({
      success: true,
      data: {
        work_order_id: workOrder.id,
        work_order_number: workOrder.work_order_number,
        current_status: workOrder.status,
        history
      }
    });

  } catch (error) {
    return handleError(error, res, next);
  }
};
module.exports = {
  createWorkOrder,
  getWorkOrders,
  allocateMaterialToWorkOrder,
  updateWorkOrderStatus,
  rescheduleWorkOrder,
  getWorkOrderById,
  getWorkOrderHistory
};