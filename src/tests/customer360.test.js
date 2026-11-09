require('dotenv').config();

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const db = require('../db');

describe('REYMASS ONE — Customer 360 API Test Suite', () => {
  let token;

beforeAll(async () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured for testing.');
  }

  token = jwt.sign(
    {
      userId: 1,
      roleId: 1,
      role: 'SUPER_ADMIN',
      permissions: ['*'],
      subsidiaryId: null
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  await db.migrate.latest();
});
  let testCustomerId = null;

  beforeAll(async () => {
    // Ensure migrations run and finish before starting tests
    await db.migrate.latest();
  });

  afterAll(async () => {
    await db.destroy();
  });

 test('1. POST /api/customers - create customer', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'REYMASS Test Client',
        email: 'client@reymass.com',
        phone: '+254700000000',
        status: 'ACTIVE'
      });

    console.log('DEBUG POST /api/customers Response:', res.body); // <--- Add this log

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    testCustomerId = res.body.data.id || res.body.data;
    console.log('DEBUG testCustomerId:', testCustomerId); // <--- Add this log
    expect(testCustomerId).toBeDefined();
  });

  test('2. GET /api/customers - list customers', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('3. GET /api/customers/:id - get single customer', async () => {
    const res = await request(app)
      .get(`/api/customers/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toEqual(testCustomerId);
  });

  test('4. PUT /api/customers/:id - update customer', async () => {
    const res = await request(app)
      .put(`/api/customers/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'REYMASS Updated Client' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toEqual('REYMASS Updated Client');
  });  test('4A. Customer account number cannot be changed', async () => {
    const original = await db('customers')
      .where({ id: testCustomerId })
      .first();

    const res = await request(app)
      .put(`/api/customers/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        account_number: 'CUST-2099-99999'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);

    const updated = await db('customers')
      .where({ id: testCustomerId })
      .first();

    expect(updated.account_number).toBe(original.account_number);
  });

  test('4B. Customer status cannot be changed through general update', async () => {
    const original = await db('customers')
      .where({ id: testCustomerId })
      .first();

    const res = await request(app)
      .put(`/api/customers/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'DELETED'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);

    const updated = await db('customers')
      .where({ id: testCustomerId })
      .first();

    expect(updated.status).toBe(original.status);
  });

  test('4C. Valid customer information can still be updated', async () => {
    const res = await request(app)
      .put(`/api/customers/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        phone: '+254711111111'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.phone).toBe('+254711111111');
  });

  test('4D. Updating a nonexistent customer returns 404', async () => {
    const res = await request(app)
      .put('/api/customers/999999')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Nonexistent Customer'
      });

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('5. GET /api/customers/:id/360 - verify Customer 360 aggregated response', async () => {
    const res = await request(app)
      .get(`/api/customers/${testCustomerId}/360`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('customer');
    expect(res.body.data).toHaveProperty('summary');
  });

  test('6. DELETE /api/customers/:id - safe customer deactivation', async () => {
    const res = await request(app)
      .delete(`/api/customers/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
  });
});