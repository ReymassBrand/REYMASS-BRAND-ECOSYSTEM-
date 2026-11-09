/**
 * REYMASS ONE - Frontend API Client Module
 * REYMASS BRAND INVESTMENT LTD (2026)
 */
class ReymassAPI {
  constructor(baseURL = 'http://localhost:5000/api/v1') {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('reymass_token') || null;
  }

  // Helper method for authenticated fetch requests
  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'API request failed.');
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error.message);
      throw error;
    }
  }

  // --- Auth Module ---
  async login(email, password) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (res.success && res.data.token) {
      this.token = res.data.token;
      localStorage.setItem('reymass_token', this.token);
    }
    return res;
  }

  logout() {
    this.token = null;
    localStorage.removeItem('reymass_token');
  }

  // --- Executive Analytics Module ---
  async getExecutiveSummary() {
    return await this.request('/analytics/executive-summary', { method: 'GET' });
  }

  // --- Work Orders Module ---
  async getWorkOrders() {
    return await this.request('/work-orders', { method: 'GET' });
  }

  async createWorkOrder(payload) {
    return await this.request('/work-orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async allocateMaterial(workOrderId, catalogItemId, quantity) {
    return await this.request('/work-orders/allocate-material', {
      method: 'POST',
      body: JSON.stringify({ workOrderId, catalogItemId, quantity }),
    });
  }

  // --- Inventory Module ---
  async getInventoryStock() {
    return await this.request('/inventory/stock', { method: 'GET' });
  }
}

// Export singleton instance
const api = new ReymassAPI();