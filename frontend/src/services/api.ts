const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

class ApiError extends Error {
  status: number
  response: Response | null

  constructor(message: string, status: number, response: Response | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.response = response
  }
}

type RequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  headers?: HeadersInit
  body?: unknown
}

class ApiClient {
  baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  async request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T | null> {
    const url = `${this.baseURL}${endpoint}`

    const mergedHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    }

    const { body, ...restOptions } = options

    const config: RequestInit = {
      ...restOptions,
      headers: mergedHeaders,
    }

    if (body !== undefined) {
      if (typeof body === 'string') {
        config.body = body
      } else {
        config.body = JSON.stringify(body)
      }
    }

    try {
      const response = await fetch(url, config)

      if (!response.ok) {
        let errorText = `HTTP ${response.status}`
        try {
          const textBody = await response.text()
          errorText = textBody || errorText
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          errorText = `HTTP ${response.status}: ${msg}`
        }
        throw new ApiError(errorText, response.status, response)
      }

      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        const text = await response.text()
        return text ? (JSON.parse(text) as T) : null
      }

      return null
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new ApiError(`Network error: ${message}`, 0, null)
    }
  }

  async get<T = unknown>(endpoint: string, params: Record<string, unknown> = {}): Promise<T | null> {
    const searchParams = new URLSearchParams()
    Object.keys(params).forEach((key) => {
      const value = params[key]
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          searchParams.append(key, value.join(','))
        } else {
          searchParams.append(key, String(value))
        }
      }
    })

    const queryString = searchParams.toString()
    const url = queryString ? `${endpoint}?${queryString}` : endpoint

    return this.request<T>(url, { method: 'GET' })
  }

  async post<T = unknown, B = unknown>(endpoint: string, data: B): Promise<T | null> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data,
    })
  }

  async put<T = unknown, B = unknown>(endpoint: string, data: B): Promise<T | null> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data,
    })
  }

  async delete<T = unknown>(endpoint: string): Promise<T | null> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    })
  }
}

// Create singleton instance
const api = new ApiClient()

// Transaction API
export const transactionApi = {
  list: (filters: Record<string, unknown> = {}) => api.get('/api/transactions', filters),
  get: (id: string | number) => api.get(`/api/transactions/${id}`),
  create: (transaction: unknown) => api.post('/api/transactions', transaction),
  update: (id: string | number, transaction: unknown) => api.put(`/api/transactions/${id}`, transaction),
  delete: (id: string | number) => api.delete(`/api/transactions/${id}`),
  recalc: (id: string, onlyMissing: boolean = true) => api.post(`/api/transactions/${id}/recalc?only_missing=${onlyMissing ? 'true' : 'false'}`, {}),
}

// Actions API
export const actionsApi = {
  perform: (action: string, params: Record<string, unknown>) => api.post('/api/actions', { action, params }),
}

// Admin API
export const adminApi = {
  // Transaction Types
  listTypes: () => api.get('/api/admin/types'),
  getType: (id: string | number) => api.get(`/api/admin/types/${id}`),
  createType: (type: unknown) => api.post('/api/admin/types', type),
  updateType: (id: string | number, type: unknown) => api.put(`/api/admin/types/${id}`, type),
  deleteType: (id: string | number) => api.delete(`/api/admin/types/${id}`),

  // Accounts
  listAccounts: () => api.get('/api/admin/accounts'),
  getAccount: (id: string | number) => api.get(`/api/admin/accounts/${id}`),
  createAccount: (account: unknown) => api.post('/api/admin/accounts', account),
  updateAccount: (id: string | number, account: unknown) => api.put(`/api/admin/accounts/${id}`, account),
  deleteAccount: (id: string | number) => api.delete(`/api/admin/accounts/${id}`),

  // Assets
  listAssets: () => api.get('/api/admin/assets'),
  getAsset: (id: string | number) => api.get(`/api/admin/assets/${id}`),
  createAsset: (asset: unknown) => api.post('/api/admin/assets', asset),
  updateAsset: (id: string | number, asset: unknown) => api.put(`/api/admin/assets/${id}`, asset),
  deleteAsset: (id: string | number) => api.delete(`/api/admin/assets/${id}`),

  // Tags
  listTags: () => api.get('/api/admin/tags'),
  getTag: (id: string | number) => api.get(`/api/admin/tags/${id}`),
  createTag: (tag: unknown) => api.post('/api/admin/tags', tag),
  updateTag: (id: string | number, tag: unknown) => api.put(`/api/admin/tags/${id}`, tag),
  deleteTag: (id: string | number) => api.delete(`/api/admin/tags/${id}`),

  // Maintenance
  recalcFX: (onlyMissing: boolean = true) => api.post(`/api/admin/maintenance/recalc-fx?only_missing=${onlyMissing ? 'true' : 'false'}`, {}),
}

// Reports API
export const reportsApi = {
  holdings: (params: Record<string, unknown> = {}) => api.get('/api/reports/holdings', params),
  holdingsSummary: (params: Record<string, unknown> = {}) => api.get('/api/reports/holdings/summary', params),
  cashFlow: (params: Record<string, unknown> = {}) => api.get('/api/reports/cashflow', params),
  spending: (params: Record<string, unknown> = {}) => api.get('/api/reports/spending', params),
  pnl: (params: Record<string, unknown> = {}) => api.get('/api/reports/pnl', params),
}

// Health check
export const healthApi = {
  check: () => api.get('/health'),
}

export default api
export { ApiError }

// Prices API (simple helper for daily spot price)
export const pricesApi = {
  // Returns array; we read last element's price
  daily: (symbol: string, currency: string, start: string, end: string) => api.get('/api/prices/daily', { symbol, currency, start, end }),
}
