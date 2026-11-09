require('dotenv').config();

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const db = require('../db');

describe('REYMASS ONE - Work Orders API Test Suite', () => {
  let organizationId;
  let techSubsidiaryId;
  let farmsSubsidiaryId;
  let customerId;
  let managerId;
  let specialistId;
  let otherSpecialistId;
  let farmsSpecialistId;

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  const makeToken = (userId, role, permissions, subsidiaryId = null) =>
    jwt.sign(
      { userId, role, permissions, subsidiaryId },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

  const insertId = async (table, data) => {
    const result = await db(table).insert(data).returning('id');

    return Array.isArray(result)
      ? (typeof result[0] === 'object' ? result[0].id : result[0])
      : result;
  };

  const uniqueWorkOrderNumber = () =>
    `TEST-WO-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  const createWorkOrderRecord = async (subsidiaryId, assignedSpecialistId = null) => {
    return insertId('work_orders', {
      work_order_number: uniqueWorkOrderNumber(),
      customer_id: customerId,
      subsidiary_id: subsidiaryId,
      assigned_specialist_id: assignedSpecialistId,
      title: 'Test Network Installation',
      description: 'Work order test record',
      priority: 'MEDIUM',
      status: assignedSpecialistId ? 'ASSIGNED' : 'PENDING'
    });
  };
  const createProductStock = async (subsidiaryId, quantity) => {
    const catalogItemId = await insertId('services_catalog', {
      subsidiary_id: subsidiaryId,
      item_code: `WO-PROD-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: 'Test Network Cable',
      item_type: 'PRODUCT',
      description: 'Material allocation test product',
      unit_price: 100,
      is_active: true
    });

    const stockId = await insertId('inventory_stock', {
      catalog_id: catalogItemId,
      subsidiary_id: subsidiaryId,
      quantity_on_hand: quantity,
      reorder_level: 1,
      warehouse_location: 'Test Warehouse'
    });

    return { catalogItemId, stockId };
  };
  beforeAll(async () => {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET must be configured for testing.');
    }

    await db.migrate.latest();

    organizationId = await insertId('organizations', {
      name: `WORK ORDER TEST ORGANIZATION ${suffix}`,
      registration_number: `WO-ORG-${suffix}`,
      email: `workorder-${suffix}@reymass.test`
    });

    techSubsidiaryId = await insertId('subsidiaries', {
      organization_id: organizationId,
      code: `WOT-${suffix}`.slice(0, 20),
      name: 'Work Order Test Tech',
      is_active: true
    });

    farmsSubsidiaryId = await insertId('subsidiaries', {
      organization_id: organizationId,
      code: `WOF-${suffix}`.slice(0, 20),
      name: 'Work Order Test Farms',
      is_active: true
    });

    
    const managerRoleId = await insertId('roles', {
      name: `WO_OPERATIONS_MANAGER_${suffix}`,
      display_name: 'Work Order Test Operations Manager'
    });

    let specialistRole = await db('roles')
  .where({ name: 'SPECIALIST' })
  .first();

   if (!specialistRole) {
   const specialistRoleId = await insertId('roles', {
    name: 'SPECIALIST',
    display_name: 'Specialist'
  });

  specialistRole = { id: specialistRoleId };
}

 const specialistRoleId = specialistRole.id;

    managerId = await insertId('users', {
      subsidiary_id: techSubsidiaryId,
      role_id: managerRoleId,
      first_name: 'Test',
      last_name: 'Manager',
      email: `manager-${suffix}@reymass.test`,
      password_hash: 'test-hash',
      is_active: true
    });

    specialistId = await insertId('users', {
      subsidiary_id: techSubsidiaryId,
      role_id: specialistRoleId,
      first_name: 'Test',
      last_name: 'Specialist',
      email: `specialist-${suffix}@reymass.test`,
      password_hash: 'test-hash',
      is_active: true
    });

    otherSpecialistId = await insertId('users', {
      subsidiary_id: techSubsidiaryId,
      role_id: specialistRoleId,
      first_name: 'Other',
      last_name: 'Specialist',
      email: `other-specialist-${suffix}@reymass.test`,
      password_hash: 'test-hash',
      is_active: true
    });

    farmsSpecialistId = await insertId('users', {
      subsidiary_id: farmsSubsidiaryId,
      role_id: specialistRoleId,
      first_name: 'Farms',
      last_name: 'Specialist',
      email: `farms-specialist-${suffix}@reymass.test`,
      password_hash: 'test-hash',
      is_active: true
    });

    customerId = await insertId('customers', {
      account_number: `WO-CUST-${suffix}`,
      account_type: 'INDIVIDUAL',
      name: 'Work Order Test Customer',
      email: `customer-${suffix}@reymass.test`,
      phone: '0712345678',
      primary_subsidiary_id: farmsSubsidiaryId,
      status: 'ACTIVE'
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('1. Operations Manager can create a work order in their subsidiary for a customer belonging to another primary subsidiary', async () => {
    const response = await request(app)
      .post('/api/v1/work-orders')
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'OPERATIONS_MANAGER', ['work_orders.create'], techSubsidiaryId)}`
      )
      .send({
        customerId,
        subsidiaryId: techSubsidiaryId,
        title: 'Install Customer Internet'
      });

    expect(response.statusCode).toBe(201);

    const savedOrder = await db('work_orders')
      .where({ id: response.body.data.id })
      .first();

    expect(savedOrder.customer_id).toBe(customerId);
    expect(savedOrder.subsidiary_id).toBe(techSubsidiaryId);
  });
  test('Scheduling: creates a work order and records its initial schedule history', async () => {
    const scheduledDate = '2026-11-06T09:00:00+03:00';

    const response = await request(app)
      .post('/api/v1/work-orders')
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'OPERATIONS_MANAGER', ['work_orders.create'], techSubsidiaryId)}`
      )
      .send({
        customerId,
        subsidiaryId: techSubsidiaryId,
        title: 'Scheduled Installation',
        scheduledDate
      });

    expect(response.statusCode).toBe(201);

    const savedOrder = await db('work_orders')
      .where({ id: response.body.data.id })
      .first();

    expect(savedOrder.scheduled_date).toBe(
      new Date(scheduledDate).toISOString()
    );

    const history = await db('work_order_schedule_history')
      .where({ work_order_id: savedOrder.id });

    expect(history).toHaveLength(1);
    expect(history[0].previous_scheduled_date).toBeNull();
    expect(history[0].new_scheduled_date).toBe(
      new Date(scheduledDate).toISOString()
    );
    expect(history[0].changed_by_user_id).toBe(managerId);

    const detailsResponse = await request(app)
      .get(`/api/v1/work-orders/${savedOrder.id}`)
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'OPERATIONS_MANAGER', ['work_orders.view'], techSubsidiaryId)}`
      );

    expect(detailsResponse.statusCode).toBe(200);
    expect(detailsResponse.body.data.schedule_history).toHaveLength(1);
  });

 test('Scheduling: rejects invalid scheduled dates', async () => {
  const invalidDates = [
    'tomorrow',
    '2026-02-30T09:00:00+03:00',
    '2026-13-01T09:00:00+03:00',
    '2026-11-05T24:00:00+03:00',
    '2026-11-05T09:00:00+15:00',
    '2026-11-05T09:00:00+14:01'
  ];

  for (const scheduledDate of invalidDates) {
    const response = await request(app)
      .post('/api/v1/work-orders')
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'OPERATIONS_MANAGER', ['work_orders.create'], techSubsidiaryId)}`
      )
      .send({
        customerId,
        subsidiaryId: techSubsidiaryId,
        title: 'Invalid Scheduled Installation',
        scheduledDate
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
  }
});
    test('Rescheduling: Super Admin can reschedule a work order', async () => {
    const workOrderId = await createWorkOrderRecord(techSubsidiaryId);
    const scheduledDate = '2026-11-10T09:00:00+03:00';

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/schedule`)
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'SUPER_ADMIN', ['work_orders.update'])}`
      )
      .send({
        scheduledDate,
        reason: 'Client requested a new installation date'
      });

    expect(response.statusCode).toBe(200);

    const savedOrder = await db('work_orders')
      .where({ id: workOrderId })
      .first();

    expect(savedOrder.scheduled_date).toBe(
      new Date(scheduledDate).toISOString()
    );

    const history = await db('work_order_schedule_history')
      .where({ work_order_id: workOrderId });

    expect(history).toHaveLength(1);
    expect(history[0].previous_scheduled_date).toBeNull();
    expect(history[0].new_scheduled_date).toBe(
      new Date(scheduledDate).toISOString()
    );
    expect(history[0].changed_by_user_id).toBe(managerId);
  });

  test('Rescheduling: Operations Manager can reschedule within their subsidiary', async () => {
    const workOrderId = await createWorkOrderRecord(techSubsidiaryId);
    const scheduledDate = '2026-11-11T10:00:00+03:00';

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/schedule`)
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'OPERATIONS_MANAGER', ['work_orders.update'], techSubsidiaryId)}`
      )
      .send({
        scheduledDate,
        reason: 'Technician availability changed'
      });

    expect(response.statusCode).toBe(200);

    const history = await db('work_order_schedule_history')
      .where({ work_order_id: workOrderId });

    expect(history).toHaveLength(1);
    expect(history[0].changed_by_user_id).toBe(managerId);
  });

  test('Rescheduling: Operations Manager cannot reschedule another subsidiary work order', async () => {
    const workOrderId = await createWorkOrderRecord(farmsSubsidiaryId);

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/schedule`)
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'OPERATIONS_MANAGER', ['work_orders.update'], techSubsidiaryId)}`
      )
      .send({
        scheduledDate: '2026-11-12T09:00:00+03:00',
        reason: 'Test unauthorized access'
      });

    expect(response.statusCode).toBe(404);

    const history = await db('work_order_schedule_history')
      .where({ work_order_id: workOrderId });

    expect(history).toHaveLength(0);
  });

  test('Rescheduling: Unauthorized roles cannot reschedule work orders', async () => {
    const workOrderId = await createWorkOrderRecord(techSubsidiaryId);

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/schedule`)
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'CEO', ['work_orders.update'])}`
      )
      .send({
        scheduledDate: '2026-11-13T09:00:00+03:00',
        reason: 'Unauthorized test'
      });

    expect(response.statusCode).toBe(403);
  });

  test('Rescheduling: Invalid dates and missing reasons are rejected', async () => {
    const workOrderId = await createWorkOrderRecord(techSubsidiaryId);

    const token = makeToken(
      managerId,
      'OPERATIONS_MANAGER',
      ['work_orders.update'],
      techSubsidiaryId
    );

   const invalidDates = [
  'tomorrow',
  '2026-02-30T09:00:00+03:00',
  '2026-13-01T09:00:00+03:00',
  '2026-11-05T24:00:00+03:00',
  '2026-11-05T09:00:00+15:00'
];

for (const scheduledDate of invalidDates) {
  const response = await request(app)
    .patch(`/api/v1/work-orders/${workOrderId}/schedule`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      scheduledDate,
      reason: 'Invalid date test'
    });

  expect(response.statusCode).toBe(400);
}
    const missingReasonResponse = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        scheduledDate: '2026-11-14T09:00:00+03:00'
      });

    expect(missingReasonResponse.statusCode).toBe(400);
  });

  test('Rescheduling: Completed and cancelled work orders cannot be rescheduled', async () => {
    for (const status of ['COMPLETED', 'CANCELLED']) {
      const workOrderId = await createWorkOrderRecord(techSubsidiaryId);

      await db('work_orders')
        .where({ id: workOrderId })
        .update({ status });

      const response = await request(app)
        .patch(`/api/v1/work-orders/${workOrderId}/schedule`)
        .set(
          'Authorization',
          `Bearer ${makeToken(managerId, 'OPERATIONS_MANAGER', ['work_orders.update'], techSubsidiaryId)}`
        )
        .send({
          scheduledDate: '2026-11-15T09:00:00+03:00',
          reason: 'Status restriction test'
        });

      expect(response.statusCode).toBe(409);

      const history = await db('work_order_schedule_history')
        .where({ work_order_id: workOrderId });

      expect(history).toHaveLength(0);
    }
  });

  test('2. Operations Manager cannot create a work order in another subsidiary', async () => {
    const response = await request(app)
      .post('/api/v1/work-orders')
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'OPERATIONS_MANAGER', ['work_orders.create'], techSubsidiaryId)}`
      )
      .send({
        customerId,
        subsidiaryId: farmsSubsidiaryId,
        title: 'Unauthorized Farms Work'
      });

    expect(response.statusCode).toBe(403);
  });

  test('3. Inactive customers cannot receive new work orders', async () => {
    await db('customers').where({ id: customerId }).update({ status: 'INACTIVE' });

    const response = await request(app)
      .post('/api/v1/work-orders')
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'OPERATIONS_MANAGER', ['work_orders.create'], techSubsidiaryId)}`
      )
      .send({
        customerId,
        subsidiaryId: techSubsidiaryId,
        title: 'Work for Inactive Customer'
      });

    await db('customers').where({ id: customerId }).update({ status: 'ACTIVE' });

    expect(response.statusCode).toBe(400);
  });

  test('4. A specialist from another subsidiary cannot be assigned to a work order', async () => {
    const response = await request(app)
      .post('/api/v1/work-orders')
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'OPERATIONS_MANAGER', ['work_orders.create'], techSubsidiaryId)}`
      )
      .send({
        customerId,
        subsidiaryId: techSubsidiaryId,
        title: 'Cross-Subsidiary Assignment',
        assignedSpecialistId: farmsSpecialistId
      });

    expect(response.statusCode).toBe(400);
  });

  test('5. Operations Manager can only view work orders in their subsidiary', async () => {
    const techOrderId = await createWorkOrderRecord(techSubsidiaryId);
    const farmsOrderId = await createWorkOrderRecord(farmsSubsidiaryId);

    const response = await request(app)
      .get('/api/v1/work-orders')
      .set(
        'Authorization',
        `Bearer ${makeToken(managerId, 'OPERATIONS_MANAGER', ['work_orders.view'], techSubsidiaryId)}`
      );

    expect(response.statusCode).toBe(200);

    const returnedIds = response.body.data.map(order => order.id);

    expect(returnedIds).toContain(techOrderId);
    expect(returnedIds).not.toContain(farmsOrderId);
  });

  test('6. Specialist can only view work orders assigned to them', async () => {
    const assignedOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    const otherAssignedOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      otherSpecialistId
    );

    const unassignedOrderId = await createWorkOrderRecord(
      techSubsidiaryId
    );

    const response = await request(app)
      .get('/api/v1/work-orders')
      .set(
        'Authorization',
        `Bearer ${makeToken(specialistId, 'SPECIALIST', ['work_orders.view'], techSubsidiaryId)}`
      );

    expect(response.statusCode).toBe(200);

    const returnedIds = response.body.data.map(order => order.id);

    expect(returnedIds).toContain(assignedOrderId);
    expect(returnedIds).not.toContain(otherAssignedOrderId);
    expect(returnedIds).not.toContain(unassignedOrderId);
  });

  test('7. CEO can view work orders across subsidiaries', async () => {
    const techOrderId = await createWorkOrderRecord(techSubsidiaryId);
    const farmsOrderId = await createWorkOrderRecord(farmsSubsidiaryId);

    const response = await request(app)
      .get('/api/v1/work-orders')
      .set(
        'Authorization',
        `Bearer ${makeToken(1, 'CEO', ['work_orders.view'])}`
      );

    expect(response.statusCode).toBe(200);

    const returnedIds = response.body.data.map(order => order.id);

    expect(returnedIds).toContain(techOrderId);
    expect(returnedIds).toContain(farmsOrderId);
  });
  test('8. Specialist can allocate materials to an assigned work order and stock is deducted', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    const { catalogItemId, stockId } = await createProductStock(
      techSubsidiaryId,
      20
    );

    const response = await request(app)
      .post('/api/v1/work-orders/allocate-material')
      .set(
        'Authorization',
        `Bearer ${makeToken(
          specialistId,
          'SPECIALIST',
          ['inventory.allocate'],
          techSubsidiaryId
        )}`
      )
      .send({
        workOrderId,
        catalogItemId,
        quantity: 5
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.allocatedQuantity).toBe(5);
    expect(Number(response.body.data.remainingStock)).toBe(15);

    const updatedStock = await db('inventory_stock')
      .where({ id: stockId })
      .first();

    expect(Number(updatedStock.quantity_on_hand)).toBe(15);

    const allocationRecord = await db('material_allocations')
      .where({
        work_order_id: workOrderId,
        catalog_id: catalogItemId
      })
      .first();

    expect(allocationRecord).toBeDefined();
    expect(allocationRecord.quantity).toBe(5);
    expect(allocationRecord.allocated_by_user_id).toBe(specialistId);
  });
  test('9. Allocation fails when requested quantity exceeds available stock', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    const { catalogItemId, stockId } = await createProductStock(
      techSubsidiaryId,
      3
    );

    const response = await request(app)
      .post('/api/v1/work-orders/allocate-material')
      .set(
        'Authorization',
        `Bearer ${makeToken(
          specialistId,
          'SPECIALIST',
          ['inventory.allocate'],
          techSubsidiaryId
        )}`
      )
      .send({
        workOrderId,
        catalogItemId,
        quantity: 5
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);

    const stock = await db('inventory_stock')
      .where({ id: stockId })
      .first();

    expect(Number(stock.quantity_on_hand)).toBe(3);

    const allocation = await db('material_allocations')
      .where({
        work_order_id: workOrderId,
        catalog_id: catalogItemId
      })
      .first();

    expect(allocation).toBeUndefined();
  });
  test('10. Specialist cannot allocate materials to another specialist work order', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      otherSpecialistId
    );

    const { catalogItemId, stockId } = await createProductStock(
      techSubsidiaryId,
      20
    );

    const response = await request(app)
      .post('/api/v1/work-orders/allocate-material')
      .set(
        'Authorization',
        `Bearer ${makeToken(
          specialistId,
          'SPECIALIST',
          ['inventory.allocate'],
          techSubsidiaryId
        )}`
      )
      .send({
        workOrderId,
        catalogItemId,
        quantity: 5
      });

    expect(response.statusCode).toBe(403);

    const stock = await db('inventory_stock')
      .where({ id: stockId })
      .first();

    expect(Number(stock.quantity_on_hand)).toBe(20);

    const allocation = await db('material_allocations')
      .where({
        work_order_id: workOrderId,
        catalog_id: catalogItemId
      })
      .first();

    expect(allocation).toBeUndefined();
  });
  test('11. Specialist cannot allocate materials from another subsidiary', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    const { catalogItemId, stockId } = await createProductStock(
      farmsSubsidiaryId,
      20
    );

    const response = await request(app)
      .post('/api/v1/work-orders/allocate-material')
      .set(
        'Authorization',
        `Bearer ${makeToken(
          specialistId,
          'SPECIALIST',
          ['inventory.allocate'],
          techSubsidiaryId
        )}`
      )
      .send({
        workOrderId,
        catalogItemId,
        quantity: 5
      });

    expect(response.statusCode).toBe(400);

    const stock = await db('inventory_stock')
      .where({ id: stockId })
      .first();

    expect(Number(stock.quantity_on_hand)).toBe(20);

    const allocation = await db('material_allocations')
      .where({
        work_order_id: workOrderId,
        catalog_id: catalogItemId
      })
      .first();

    expect(allocation).toBeUndefined();
  });
  test('12. Operations Manager can allocate materials within their subsidiary', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    const { catalogItemId, stockId } = await createProductStock(
      techSubsidiaryId,
      30
    );

    const response = await request(app)
      .post('/api/v1/work-orders/allocate-material')
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['inventory.allocate'],
          techSubsidiaryId
        )}`
      )
      .send({
        workOrderId,
        catalogItemId,
        quantity: 10
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Number(response.body.data.remainingStock)).toBe(20);

    const stock = await db('inventory_stock')
      .where({ id: stockId })
      .first();

    expect(Number(stock.quantity_on_hand)).toBe(20);

    const allocation = await db('material_allocations')
      .where({
        work_order_id: workOrderId,
        catalog_id: catalogItemId
      })
      .first();

    expect(allocation).toBeDefined();
    expect(allocation.quantity).toBe(10);
    expect(allocation.allocated_by_user_id).toBe(managerId);
  });
  test('13. SUPER_ADMIN can allocate materials across subsidiaries', async () => {
    let superAdminRole = await db('roles')
      .where({ name: 'SUPER_ADMIN' })
      .first();

    if (!superAdminRole) {
      const roleId = await insertId('roles', {
        name: 'SUPER_ADMIN',
        display_name: 'Super Administrator'
      });

      superAdminRole = { id: roleId };
    }

    const superAdminId = await insertId('users', {
      subsidiary_id: null,
      role_id: superAdminRole.id,
      first_name: 'Test',
      last_name: 'Administrator',
      email: `superadmin-${suffix}@reymass.test`,
      password_hash: 'test-hash',
      is_active: true
    });

    const workOrderId = await createWorkOrderRecord(
      farmsSubsidiaryId
    );

    const { catalogItemId, stockId } = await createProductStock(
      farmsSubsidiaryId,
      25
    );

    const response = await request(app)
      .post('/api/v1/work-orders/allocate-material')
      .set(
        'Authorization',
        `Bearer ${makeToken(
          superAdminId,
          'SUPER_ADMIN',
          ['inventory.allocate']
        )}`
      )
      .send({
        workOrderId,
        catalogItemId,
        quantity: 10
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Number(response.body.data.remainingStock)).toBe(15);

    const stock = await db('inventory_stock')
      .where({ id: stockId })
      .first();

    expect(Number(stock.quantity_on_hand)).toBe(15);

    const allocation = await db('material_allocations')
      .where({
        work_order_id: workOrderId,
        catalog_id: catalogItemId
      })
      .first();

    expect(allocation).toBeDefined();
    expect(allocation.quantity).toBe(10);
    expect(allocation.allocated_by_user_id).toBe(superAdminId);
  });
  test('14. Invalid material allocation requests are rejected', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    const { catalogItemId } = await createProductStock(
      techSubsidiaryId,
      20
    );

    const invalidRequests = [
      { workOrderId, catalogItemId, quantity: 0 },
      { workOrderId, catalogItemId, quantity: -5 },
      { workOrderId, catalogItemId, quantity: 1.5 },
      { catalogItemId, quantity: 5 },
      { workOrderId, quantity: 5 }
    ];

    for (const payload of invalidRequests) {
      const response = await request(app)
        .post('/api/v1/work-orders/allocate-material')
        .set(
          'Authorization',
          `Bearer ${makeToken(
            specialistId,
            'SPECIALIST',
            ['inventory.allocate'],
            techSubsidiaryId
          )}`
        )
        .send(payload);

      expect(response.statusCode).toBe(400);
    }
  });
  test('15. Materials cannot be allocated to completed work orders', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    await db('work_orders')
      .where({ id: workOrderId })
      .update({ status: 'COMPLETED' });

    const { catalogItemId, stockId } = await createProductStock(
      techSubsidiaryId,
      20
    );

    const response = await request(app)
      .post('/api/v1/work-orders/allocate-material')
      .set(
        'Authorization',
        `Bearer ${makeToken(
          specialistId,
          'SPECIALIST',
          ['inventory.allocate'],
          techSubsidiaryId
        )}`
      )
      .send({
        workOrderId,
        catalogItemId,
        quantity: 5
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toMatch(/completed work order/i);

    const stock = await db('inventory_stock')
      .where({ id: stockId })
      .first();

    expect(Number(stock.quantity_on_hand)).toBe(20);

    const allocationCount = await db('material_allocations')
      .where({ work_order_id: workOrderId })
      .count({ total: '*' })
      .first();

    expect(Number(allocationCount.total)).toBe(0);
  });

  test('16. Materials cannot be allocated to cancelled work orders', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    await db('work_orders')
      .where({ id: workOrderId })
      .update({ status: 'CANCELLED' });

    const { catalogItemId, stockId } = await createProductStock(
      techSubsidiaryId,
      20
    );

    const response = await request(app)
      .post('/api/v1/work-orders/allocate-material')
      .set(
        'Authorization',
        `Bearer ${makeToken(
          specialistId,
          'SPECIALIST',
          ['inventory.allocate'],
          techSubsidiaryId
        )}`
      )
      .send({
        workOrderId,
        catalogItemId,
        quantity: 5
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toMatch(/cancelled work order/i);

    const stock = await db('inventory_stock')
      .where({ id: stockId })
      .first();

    expect(Number(stock.quantity_on_hand)).toBe(20);

    const allocationCount = await db('material_allocations')
      .where({ work_order_id: workOrderId })
      .count({ total: '*' })
      .first();

    expect(Number(allocationCount.total)).toBe(0);
  });
  // WORK ORDER LIFECYCLE TESTS

  test('17. Operations Manager can assign a pending work order', async () => {
    const workOrderId = await createWorkOrderRecord(techSubsidiaryId);

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/status`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.update'],
          techSubsidiaryId
        )}`
      )
      .send({
        newStatus: 'ASSIGNED',
        assignedSpecialistId: specialistId,
        notes: 'Assigned for installation.'
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.newStatus).toBe('ASSIGNED');

    const workOrder = await db('work_orders')
      .where({ id: workOrderId })
      .first();

    expect(Number(workOrder.assigned_specialist_id)).toBe(Number(specialistId));
  });

  test('18. Manager cannot assign a specialist from another subsidiary', async () => {
    const workOrderId = await createWorkOrderRecord(techSubsidiaryId);

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/status`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.update'],
          techSubsidiaryId
        )}`
      )
      .send({
        newStatus: 'ASSIGNED',
        assignedSpecialistId: farmsSpecialistId
      });

    expect(response.statusCode).toBe(400);

    const workOrder = await db('work_orders')
      .where({ id: workOrderId })
      .first();

    expect(workOrder.status).toBe('PENDING');
  });

  test('19. Assigned specialist can start work', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/status`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          specialistId,
          'SPECIALIST',
          ['work_orders.update'],
          techSubsidiaryId
        )}`
      )
      .send({
        newStatus: 'IN_PROGRESS',
        notes: 'Installation has started.'
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.newStatus).toBe('IN_PROGRESS');
  });

  test('20. Specialist cannot start work assigned to another specialist', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/status`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          otherSpecialistId,
          'SPECIALIST',
          ['work_orders.update'],
          techSubsidiaryId
        )}`
      )
      .send({
        newStatus: 'IN_PROGRESS'
      });

    expect(response.statusCode).toBe(403);
  });

  test('21. Operations Manager can complete work in progress', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    await db('work_orders')
      .where({ id: workOrderId })
      .update({ status: 'IN_PROGRESS' });

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/status`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.update'],
          techSubsidiaryId
        )}`
      )
      .send({
        newStatus: 'COMPLETED',
        notes: 'Installation completed successfully.'
      });

    expect(response.statusCode).toBe(200);

    const workOrder = await db('work_orders')
      .where({ id: workOrderId })
      .first();

    expect(workOrder.status).toBe('COMPLETED');
    expect(workOrder.completed_at).not.toBeNull();
  });

  test('22. Operations Manager can cancel a pending work order', async () => {
    const workOrderId = await createWorkOrderRecord(techSubsidiaryId);

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/status`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.update'],
          techSubsidiaryId
        )}`
      )
      .send({
        newStatus: 'CANCELLED',
        notes: 'Customer cancelled the installation.'
      });

    expect(response.statusCode).toBe(200);

    const workOrder = await db('work_orders')
      .where({ id: workOrderId })
      .first();

    expect(workOrder.status).toBe('CANCELLED');
    expect(workOrder.completed_at).toBeNull();
  });

  test('23. Completed work orders cannot be reopened', async () => {
    const workOrderId = await createWorkOrderRecord(techSubsidiaryId);

    await db('work_orders')
      .where({ id: workOrderId })
      .update({
        status: 'COMPLETED',
        completed_at: db.fn.now()
      });

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/status`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.update'],
          techSubsidiaryId
        )}`
      )
      .send({
        newStatus: 'IN_PROGRESS'
      });

    expect(response.statusCode).toBe(400);
  });

  test('24. Successful status changes create audit history', async () => {
    const workOrderId = await createWorkOrderRecord(techSubsidiaryId);

    const response = await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/status`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.update'],
          techSubsidiaryId
        )}`
      )
      .send({
        newStatus: 'ASSIGNED',
        assignedSpecialistId: specialistId,
        notes: 'Audit history test.'
      });

    expect(response.statusCode).toBe(200);

    const history = await db('work_order_status_history')
      .where({ work_order_id: workOrderId })
      .first();

    expect(history).toBeDefined();
    expect(history.previous_status).toBe('PENDING');
    expect(history.new_status).toBe('ASSIGNED');
    expect(Number(history.changed_by_user_id)).toBe(Number(managerId));
    expect(history.notes).toBe('Audit history test.');
  });
  // WORK ORDER DETAILS AND HISTORY TESTS

  test('25. Operations Manager can retrieve individual work-order details', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      specialistId
    );

    const response = await request(app)
      .get(`/api/v1/work-orders/${workOrderId}`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.view'],
          techSubsidiaryId
        )}`
      );

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Number(response.body.data.id)).toBe(Number(workOrderId));
    expect(response.body.data.customer_name).toBe('Work Order Test Customer');
    expect(response.body.data.assigned_specialist).not.toBeNull();
    expect(Number(response.body.data.assigned_specialist.id))
      .toBe(Number(specialistId));
    expect(Array.isArray(response.body.data.materials)).toBe(true);
    expect(Array.isArray(response.body.data.status_history)).toBe(true);
  });

  test('26. Operations Manager can retrieve work-order status history', async () => {
    const workOrderId = await createWorkOrderRecord(techSubsidiaryId);

    await request(app)
      .patch(`/api/v1/work-orders/${workOrderId}/status`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.update'],
          techSubsidiaryId
        )}`
      )
      .send({
        newStatus: 'ASSIGNED',
        assignedSpecialistId: specialistId,
        notes: 'History retrieval test.'
      });

    const response = await request(app)
      .get(`/api/v1/work-orders/${workOrderId}/history`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.view'],
          techSubsidiaryId
        )}`
      );

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Number(response.body.data.work_order_id))
      .toBe(Number(workOrderId));
    expect(response.body.data.current_status).toBe('ASSIGNED');
    expect(response.body.data.history).toHaveLength(1);
    expect(response.body.data.history[0].previous_status).toBe('PENDING');
    expect(response.body.data.history[0].new_status).toBe('ASSIGNED');
    expect(response.body.data.history[0].notes)
      .toBe('History retrieval test.');
  });

  test('27. Invalid work-order IDs are rejected', async () => {
    const response = await request(app)
      .get('/api/v1/work-orders/invalid')
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.view'],
          techSubsidiaryId
        )}`
      );

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
  });
  // WORK ORDER ACCESS CONTROL TESTS

  test('28. Operations Manager cannot access another subsidiary work orders', async () => {
    const workOrderId = await createWorkOrderRecord(
      farmsSubsidiaryId,
      farmsSpecialistId
    );

    const response = await request(app)
      .get(`/api/v1/work-orders/${workOrderId}`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.view'],
          techSubsidiaryId
        )}`
      );

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test('29. Specialist cannot access another specialist work order details', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      otherSpecialistId
    );

    const response = await request(app)
      .get(`/api/v1/work-orders/${workOrderId}`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          specialistId,
          'SPECIALIST',
          ['work_orders.view'],
          techSubsidiaryId
        )}`
      );

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test('30. Specialist cannot access another specialist work order history', async () => {
    const workOrderId = await createWorkOrderRecord(
      techSubsidiaryId,
      otherSpecialistId
    );

    const response = await request(app)
      .get(`/api/v1/work-orders/${workOrderId}/history`)
      .set(
        'Authorization',
        `Bearer ${makeToken(
          specialistId,
          'SPECIALIST',
          ['work_orders.view'],
          techSubsidiaryId
        )}`
      );

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test('31. Non-existent work orders return 404', async () => {
    const response = await request(app)
      .get('/api/v1/work-orders/999999999')
      .set(
        'Authorization',
        `Bearer ${makeToken(
          managerId,
          'OPERATIONS_MANAGER',
          ['work_orders.view'],
          techSubsidiaryId
        )}`
      );

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
