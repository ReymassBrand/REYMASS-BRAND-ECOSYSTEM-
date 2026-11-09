const db = require('../db');

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error('Amounts must be valid, non-negative numbers.');
  }

  return Math.round(number * 100);
}

function formatMoney(cents) {
  return (cents / 100).toFixed(2);
}

function generateQuotationNumber(id) {
  return `QT-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

async function createQuotation(req, res) {
  try {
    const {
      customerId,
      subsidiaryId,
      validUntil,
      items,
      taxAmount = 0,
      discountAmount = 0,
      terms = null,
      notes = null
    } = req.body;

    if (
      !Number.isInteger(Number(customerId)) ||
      Number(customerId) <= 0 ||
      !Number.isInteger(Number(subsidiaryId)) ||
      Number(subsidiaryId) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid customerId and subsidiaryId are required.'
      });
    }

    if (!isValidDate(validUntil) || validUntil < today()) {
      return res.status(400).json({
        success: false,
        message: 'validUntil must be today or a future date in YYYY-MM-DD format.'
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one quotation item is required.'
      });
    }

    if (items.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'A quotation cannot contain more than 200 items.'
      });
    }

    const taxCents = money(taxAmount);
    const discountCents = money(discountAmount);

    const normalizedItems = items.map((item) => {
      const description = String(item.description || '').trim();
      const quantity = Number(item.quantity);
      const unitPriceCents = money(item.unitPrice);

      if (!description || description.length > 255) {
        throw new Error('Each item needs a description of 1–255 characters.');
      }

      if (
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        quantity > 1000000
      ) {
        throw new Error('Item quantity must be a positive whole number.');
      }

      const lineTotalCents = quantity * unitPriceCents;

      if (!Number.isSafeInteger(lineTotalCents)) {
        throw new Error('An item total is too large.');
      }

      return {
        description,
        quantity,
        unitPriceCents,
        lineTotalCents
      };
    });

    const subtotalCents = normalizedItems.reduce(
      (sum, item) => sum + item.lineTotalCents,
      0
    );

    if (
      !Number.isSafeInteger(subtotalCents) ||
      discountCents > subtotalCents
    ) {
      return res.status(400).json({
        success: false,
        message: 'Discount cannot exceed the subtotal.'
      });
    }

    const totalCents = subtotalCents - discountCents + taxCents;

    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quotation total must be greater than zero.'
      });
    }

    const result = await db.transaction(async (trx) => {
      const customer = await trx('customers')
        .where({ id: Number(customerId) })
        .first();

      if (!customer || customer.status !== 'ACTIVE') {
        throw new Error('Customer not found or inactive.');
      }

      const subsidiary = await trx('subsidiaries')
        .where({ id: Number(subsidiaryId), is_active: true })
        .first();

      if (!subsidiary) {
        throw new Error('Subsidiary not found or inactive.');
      }

      const insertResult = await trx('quotations').insert({
        quotation_number: `QT-TEMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        customer_id: Number(customerId),
        subsidiary_id: Number(subsidiaryId),
        issue_date: today(),
        valid_until: validUntil,
        subtotal: formatMoney(subtotalCents),
        tax_amount: formatMoney(taxCents),
        discount_amount: formatMoney(discountCents),
        total_amount: formatMoney(totalCents),
        status: 'DRAFT',
        terms: terms ? String(terms).slice(0, 10000) : null,
        notes: notes ? String(notes).slice(0, 10000) : null,
        created_by: req.user?.id || null
      });

      const quotationId = Array.isArray(insertResult)
        ? (typeof insertResult[0] === 'object'
            ? insertResult[0].id
            : insertResult[0])
        : insertResult;

      if (!quotationId) {
        throw new Error('Could not determine the new quotation ID.');
      }

      const quotationNumber = generateQuotationNumber(quotationId);

      await trx('quotations')
        .where({ id: quotationId })
        .update({ quotation_number: quotationNumber });

      await trx('quotation_items').insert(
        normalizedItems.map((item) => ({
          quotation_id: quotationId,
          description: item.description,
          quantity: item.quantity,
          unit_price: formatMoney(item.unitPriceCents),
          line_total: formatMoney(item.lineTotalCents)
        }))
      );

      return {
        id: quotationId,
        quotationNumber,
        customerId: Number(customerId),
        subsidiaryId: Number(subsidiaryId),
        issueDate: today(),
        validUntil,
        subtotal: formatMoney(subtotalCents),
        taxAmount: formatMoney(taxCents),
        discountAmount: formatMoney(discountCents),
        totalAmount: formatMoney(totalCents),
        status: 'DRAFT',
        items: normalizedItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: formatMoney(item.unitPriceCents),
          lineTotal: formatMoney(item.lineTotalCents)
        }))
      };
    });

    return res.status(201).json({
      success: true,
      message: 'Quotation created successfully.',
      data: result
    });
  } catch (error) {
    const clientErrors = [
      'Customer not found or inactive.',
      'Subsidiary not found or inactive.'
    ];

    const status = clientErrors.includes(error.message) ? 400 : 400;

    return res.status(status).json({
      success: false,
      message: error.message || 'Could not create quotation.'
    });
  }
}

async function listQuotations(req, res) {
  try {
    const quotations = await db('quotations')
      .select(
        'quotations.*',
        'customers.name as customer_name',
        'subsidiaries.name as subsidiary_name'
      )
      .leftJoin('customers', 'quotations.customer_id', 'customers.id')
      .leftJoin('subsidiaries', 'quotations.subsidiary_id', 'subsidiaries.id')
      .orderBy('quotations.id', 'desc')
      .limit(200);

    return res.json({
      success: true,
      count: quotations.length,
      data: quotations
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Could not retrieve quotations.'
    });
  }
}

async function getQuotation(req, res) {
  try {
    const quotation = await db('quotations')
      .where({ id: Number(req.params.id) })
      .first();

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found.'
      });
    }

    const items = await db('quotation_items')
      .where({ quotation_id: quotation.id })
      .select('*');

    return res.json({
      success: true,
      data: { ...quotation, items }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Could not retrieve quotation.'
    });
  }
}

async function updateQuotationStatus(req, res) {
  try {
    const allowedStatuses = ['SENT', 'VIEWED', 'APPROVED', 'REJECTED'];

    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be SENT, VIEWED, APPROVED, or REJECTED.'
      });
    }

    const quotation = await db('quotations')
      .where({ id: Number(req.params.id) })
      .first();

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found.'
      });
    }

    if (quotation.status === 'EXPIRED') {
      return res.status(400).json({
        success: false,
        message: 'Expired quotations cannot be updated.'
      });
    }

    if (quotation.status === 'REJECTED' || quotation.status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Approved or rejected quotations cannot be changed.'
      });
    }

    if (quotation.valid_until < today()) {
      await db('quotations')
        .where({ id: quotation.id })
        .update({ status: 'EXPIRED' });

      return res.status(400).json({
        success: false,
        message: 'This quotation has expired.'
      });
    }

    await db('quotations')
      .where({ id: quotation.id })
      .update({ status: req.body.status });

    return res.json({
      success: true,
      message: 'Quotation status updated.',
      data: {
        id: quotation.id,
        status: req.body.status
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Could not update quotation status.'
    });
  }
}

module.exports = {
  createQuotation,
  listQuotations,
  getQuotation,
  updateQuotationStatus
};