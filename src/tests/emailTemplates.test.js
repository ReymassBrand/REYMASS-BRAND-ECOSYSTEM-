const {
  escapeHtml,
  createEmailLayout,
  welcomeEmail,
  invoiceEmail,
  paymentConfirmationEmail,
  workOrderEmail,
  passwordResetEmail
} = require('../services/emailTemplates');

describe('REYMASS ONE Email Templates', () => {

  test('should safely escape HTML characters', () => {
    const result = escapeHtml('<script>alert("test")</script>');

    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&quot;');
  });

  test('should create a branded REYMASS ONE email layout', () => {
    const email = createEmailLayout({
      title: 'Test Email',
      recipientName: 'Brian',
      content: '<p>Welcome.</p>'
    });

    expect(email.html).toContain('REYMASS');
    expect(email.html).toContain('REYMASS ONE');
    expect(email.html).toContain('#D4AF37');
    expect(email.html).toContain('Brian');
    expect(email.text).toContain('Test Email');
  });

  test('should create a customer welcome email', () => {
    const email = welcomeEmail({
      customerName: 'John'
    });

    expect(email.html).toContain('Welcome to REYMASS');
    expect(email.html).toContain('John');
    expect(email.text).toContain('John');
  });

  test('should create an invoice notification', () => {
    const email = invoiceEmail({
      customerName: 'Mary',
      invoiceNumber: 'INV-001',
      amount: 'KES 5,000',
      dueDate: '2026-11-30'
    });

    expect(email.html).toContain('INV-001');
    expect(email.html).toContain('KES 5,000');
    expect(email.html).toContain('2026-11-30');
  });

  test('should create an M-Pesa payment confirmation', () => {
    const email = paymentConfirmationEmail({
      customerName: 'Peter',
      amount: 'KES 2,500',
      receiptNumber: 'QWE123456',
      paymentDate: '2026-11-09'
    });

    expect(email.html).toContain('Payment Confirmation');
    expect(email.html).toContain('QWE123456');
    expect(email.html).toContain('KES 2,500');
  });

  test('should create a work-order update', () => {
    const email = workOrderEmail({
      customerName: 'Grace',
      workOrderNumber: 'WO-001',
      status: 'IN_PROGRESS',
      description: 'Internet installation'
    });

    expect(email.html).toContain('WO-001');
    expect(email.html).toContain('IN_PROGRESS');
    expect(email.html).toContain('Internet installation');
  });

  test('should create a password-reset email', () => {
    const email = passwordResetEmail({
      customerName: 'David',
      resetUrl: 'https://reymassbrand.co.ke/reset/token123'
    });

    expect(email.html).toContain('Password Reset Request');
    expect(email.html).toContain('David');
    expect(email.html).toContain('Reset My Password');
    expect(email.html).toContain('token123');
  });

  test('should escape malicious customer names', () => {
    const email = welcomeEmail({
      customerName: '<script>alert("hack")</script>'
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  test('should escape invoice information', () => {
    const email = invoiceEmail({
      customerName: 'Mary',
      invoiceNumber: '<script>hack</script>',
      amount: 'KES 1000',
      dueDate: '2026-11-30'
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

});