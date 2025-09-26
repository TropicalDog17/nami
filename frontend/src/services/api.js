const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

class ApiError extends Error {
  constructor(message, status, response) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.response = response
  }
}

class ApiClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    if (config.body && typeof config.body !== 'string') {
      config.body = JSON.stringify(config.body)
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new ApiError(
          errorText || `HTTP ${response.status}`,
          response.status,
          response
        )
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return await response.json()
      }
      
      return null
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      throw new ApiError(`Network error: ${error.message}`, 0, null)
    }
  }

  async get(endpoint, params = {}) {
    const searchParams = new URLSearchParams()
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        if (Array.isArray(params[key])) {
          searchParams.append(key, params[key].join(','))
        } else {
          searchParams.append(key, params[key])
        }
      }
    })
    
    const queryString = searchParams.toString()
    const url = queryString ? `${endpoint}?${queryString}` : endpoint
    
    return this.request(url, { method: 'GET' })
  }

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: data,
    })
  }

  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: data,
    })
  }

  async delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE',
    })
  }
}

// Create singleton instance
const api = new ApiClient()

// Transaction API
export const transactionApi = {
  list: (filters = {}) => api.get('/api/transactions', filters),
  get: (id) => api.get(`/api/transactions/${id}`),
  create: (transaction) => api.post('/api/transactions', transaction),
  update: (id, transaction) => api.put(`/api/transactions/${id}`, transaction),
  delete: (id) => api.delete(`/api/transactions/${id}`),
}

// Admin API
export const adminApi = {
  // Transaction Types
  listTypes: () => api.get('/api/admin/types'),
  getType: (id) => api.get(`/api/admin/types/${id}`),
  createType: (type) => api.post('/api/admin/types', type),
  updateType: (id, type) => api.put(`/api/admin/types/${id}`, type),
  deleteType: (id) => api.delete(`/api/admin/types/${id}`),

  // Accounts
  listAccounts: () => api.get('/api/admin/accounts'),
  getAccount: (id) => api.get(`/api/admin/accounts/${id}`),
  createAccount: (account) => api.post('/api/admin/accounts', account),
  updateAccount: (id, account) => api.put(`/api/admin/accounts/${id}`, account),
  deleteAccount: (id) => api.delete(`/api/admin/accounts/${id}`),

  // Assets
  listAssets: () => api.get('/api/admin/assets'),
  getAsset: (id) => api.get(`/api/admin/assets/${id}`),
  createAsset: (asset) => api.post('/api/admin/assets', asset),
  updateAsset: (id, asset) => api.put(`/api/admin/assets/${id}`, asset),
  deleteAsset: (id) => api.delete(`/api/admin/assets/${id}`),

  // Tags
  listTags: () => api.get('/api/admin/tags'),
  getTag: (id) => api.get(`/api/admin/tags/${id}`),
  createTag: (tag) => api.post('/api/admin/tags', tag),
  updateTag: (id, tag) => api.put(`/api/admin/tags/${id}`, tag),
  deleteTag: (id) => api.delete(`/api/admin/tags/${id}`),
}

// Reports API
export const reportsApi = {
  holdings: (params = {}) => api.get('/api/reports/holdings', params),
  holdingsSummary: (params = {}) => api.get('/api/reports/holdings/summary', params),
  cashFlow: (params = {}) => api.get('/api/reports/cashflow', params),
  spending: (params = {}) => api.get('/api/reports/spending', params),
  pnl: (params = {}) => api.get('/api/reports/pnl', params),
}

// Health check
export const healthApi = {
  check: () => api.get('/health'),
}

export default api
export { ApiError }
