require('dotenv').config();

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const db = require('../db');

describe('REYMASS ONE - Inventory API Test Suite', () => {
  let organizationId;
  let techSubsidiaryId;
  let farmsSubsidiaryId;

  const makeToken = (role, permissions, subsidiaryId = null) => {
    return jwt.sign(
      {
        userId: 1,
        roleId: 1,
        role,
        permissions,
        subsidiaryId
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '15m'
      }
    );
  };

  const superAdminToken = () =>
    makeToken('SUPER_ADMIN', ['*']);

  const operationsToken = () =>
    makeToken(
      'OPERATIONS_MANAGER',
      ['inventory.view', 'inventory.create'],
      techSubsidiaryId
    );
const operationsAdjustToken = () =>
  makeToken(
    'OPERATIONS_MANAGER',
    ['inventory.view', 'inventory.create', 'inventory.adjust'],
    techSubsidiaryId
  );
  const specialistToken = () =>
    makeToken(
      'SPECIALIST',
      ['inventory.view'],
      techSubsidiaryId
    );

  const uniqueCode = (prefix = 'TEST') =>
    `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET must be configured for testing.');
    }

    await db.migrate.latest();

    const organizationResult = await db('organizations').insert({
      name: `INVENTORY TEST ORGANIZATION ${Date.now()}`,
      registration_number: `INV-ORG-${Date.now()}`,
      email: `inventory-${Date.now()}@reymass.test`
    });

    organizationId = Array.isArray(organizationResult)
      ? organizationResult[0]
      : organizationResult;

    const techResult = await db('subsidiaries').insert({
      organization_id: organizationId,
      code: uniqueCode('TECH').slice(0, 20),
      name: 'Inventory Test Tech',
      is_active: true
    });

    techSubsidiaryId = Array.isArray(techResult)
      ? techResult[0]
      : techResult;

    const farmsResult = await db('subsidiaries').insert({
      organization_id: organizationId,
      code: uniqueCode('FARMS').slice(0, 20),
      name: 'Inventory Test Farms',
      is_active: true
    });

    farmsSubsidiaryId = Array.isArray(farmsResult)
      ? farmsResult[0]
      : farmsResult;
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('1. SUPER_ADMIN can create a product and initialize stock', async () => {
    const itemCode = uniqueCode('ROUTER');

    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({
        subsidiaryId: techSubsidiaryId,
        itemCode,
        name: 'Test Gigabit Router',
        itemType: 'PRODUCT',
        unitPrice: 4500,
        initialStock: 20
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);

    const item = await db('services_catalog')
      .where({ item_code: itemCode })
      .first();

    expect(item).toBeDefined();

    const stock = await db('inventory_stock')
      .where({ catalog_id: item.id })
      .first();

    expect(stock).toBeDefined();
    expect(stock.quantity_on_hand).toBe(20);
  });

  test('2. OPERATIONS_MANAGER can create inventory in assigned subsidiary', async () => {
    const itemCode = uniqueCode('MANAGER');

    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${operationsToken()}`)
      .send({
        itemCode,
        name: 'Manager Created Product',
        itemType: 'PRODUCT',
        unitPrice: 1500,
        initialStock: 10
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);

    const item = await db('services_catalog')
      .where({ item_code: itemCode })
      .first();

    expect(item.subsidiary_id).toBe(techSubsidiaryId);
  });

  test('3. OPERATIONS_MANAGER cannot create inventory in another subsidiary', async () => {
    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${operationsToken()}`)
      .send({
        subsidiaryId: farmsSubsidiaryId,
        itemCode: uniqueCode('FORBIDDEN'),
        name: 'Unauthorized Product',
        unitPrice: 1000,
        initialStock: 5
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test('4. OPERATIONS_MANAGER cannot create inventory without assigned subsidiary', async () => {
    const token = makeToken(
      'OPERATIONS_MANAGER',
      ['inventory.create'],
      null
    );

    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({
        itemCode: uniqueCode('NO-SUB'),
        name: 'Unassigned Product',
        unitPrice: 1000
      });

    expect(response.statusCode).toBe(403);
  });

  test('5. SERVICE items do not create stock records', async () => {
    const itemCode = uniqueCode('SERVICE');

    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({
        subsidiaryId: techSubsidiaryId,
        itemCode,
        name: 'Network Installation Service',
        itemType: 'SERVICE',
        unitPrice: 2500
      });

    expect(response.statusCode).toBe(201);

    const item = await db('services_catalog')
      .where({ item_code: itemCode })
      .first();

    expect(item).toBeDefined();

    const stock = await db('inventory_stock')
      .where({ catalog_id: item.id })
      .first();

    expect(stock).toBeUndefined();
  });

  test('6. Invalid negative unit price is rejected', async () => {
    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({
        subsidiaryId: techSubsidiaryId,
        itemCode: uniqueCode('INVALID'),
        name: 'Invalid Price Product',
        unitPrice: -100
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('7. Invalid fractional stock quantity is rejected', async () => {
    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({
        subsidiaryId: techSubsidiaryId,
        itemCode: uniqueCode('FRACTION'),
        name: 'Fractional Stock Product',
        unitPrice: 1000,
        initialStock: 2.5
      });

    expect(response.statusCode).toBe(400);
  });

  test('8. Unsupported item type is rejected', async () => {
    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({
        subsidiaryId: techSubsidiaryId,
        itemCode: uniqueCode('INVALID-TYPE'),
        name: 'Invalid Item',
        itemType: 'UNKNOWN',
        unitPrice: 1000
      });

    expect(response.statusCode).toBe(400);
  });

  test('9. CEO can view inventory across subsidiaries', async () => {
    const itemCode = uniqueCode('FARM-PRODUCT');

    const catalogResult = await db('services_catalog').insert({
      subsidiary_id: farmsSubsidiaryId,
      item_code: itemCode,
      name: 'Farms Test Product',
      item_type: 'PRODUCT',
      unit_price: 500
    }).returning('id');

    const catalogId = Array.isArray(catalogResult)
      ? (typeof catalogResult[0] === 'object'
          ? catalogResult[0].id
          : catalogResult[0])
      : catalogResult;

    await db('inventory_stock').insert({
      catalog_id: catalogId,
      subsidiary_id: farmsSubsidiaryId,
      quantity_on_hand: 15,
      warehouse_location: 'Farms Warehouse'
    });

    const token = makeToken('CEO', ['inventory.view']);

    const response = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);

    const farmItem = response.body.data.find(
      item => item.item_code === itemCode
    );

    expect(farmItem).toBeDefined();
  });

  test('10. SPECIALIST can only view inventory in assigned subsidiary', async () => {
    const token = specialistToken();

    const response = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);

    for (const item of response.body.data) {
      expect(item.subsidiary_id).toBe(techSubsidiaryId);
    }
  });

  test('11. SPECIALIST without assigned subsidiary is denied', async () => {
    const token = makeToken(
      'SPECIALIST',
      ['inventory.view'],
      null
    );

    const response = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(403);
  });

  test('12. CUSTOMER cannot view inventory', async () => {
    const token = makeToken(
      'CUSTOMER',
      ['inventory.view'],
      techSubsidiaryId
    );

    const response = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(403);
  });

  test('13. Unauthenticated requests cannot view inventory', async () => {
    const response = await request(app)
      .get('/api/v1/inventory');

    expect(response.statusCode).toBe(401);
  });
    test('14. SUPER_ADMIN can receive additional inventory stock', async () => {
    const itemCode = uniqueCode('STOCK-IN');

    // Create a product with 20 units in stock.
    const createResponse = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({
        subsidiaryId: techSubsidiaryId,
        itemCode,
        name: 'Stock In Test Router',
        itemType: 'PRODUCT',
        unitPrice: 3000,
        initialStock: 20
      });

    expect(createResponse.statusCode).toBe(201);

    const item = await db('services_catalog')
      .where({ item_code: itemCode })
      .first();

    const stock = await db('inventory_stock')
      .where({ catalog_id: item.id })
      .first();

    // Receive 5 additional units.
    const response = await request(app)
      .post(`/api/v1/inventory/${stock.id}/stock-in`)
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({
        quantity: 5,
        notes: 'Test stock delivery'
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.quantityBefore).toBe(20);
    expect(response.body.data.quantityAfter).toBe(25);

    // Confirm the permanent movement ledger entry.
    const movement = await db('inventory_movements')
      .where({
        stock_id: stock.id,
        movement_type: 'STOCK_IN'
      })
      .first();

    expect(movement).toBeDefined();
    expect(movement.quantity).toBe(5);
    expect(movement.quantity_before).toBe(20);
    expect(movement.quantity_after).toBe(25);
  });
    });