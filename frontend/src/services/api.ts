const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080');

class ApiError extends Error {
  status: number;
  response: Response | null;

  constructor(message: string, status: number, response: Response | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.response = response;
  }
}

type RequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  headers?: HeadersInit;
  body?: unknown;
};

class ApiClient {
  baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T | null> {
    const url = `${this.baseURL}${endpoint}`;

    const mergedHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };

    const { body, ...restOptions } = options;

    const config: RequestInit = {
      ...restOptions,
      headers: mergedHeaders,
    };

    if (body !== undefined) {
      if (typeof body === 'string') {
        config.body = body;
      } else {
        config.body = JSON.stringify(body);
      }
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        let errorText = `HTTP ${response.status}`;
        try {
          const textBody = await response.text();
          errorText = textBody || errorText;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errorText = `HTTP ${response.status}: ${msg}`;
        }
        throw new ApiError(errorText, response.status, response);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json') === true) {
        const text = await response.text();
        return text ? (JSON.parse(text) as T) : null;
      }

      return null;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new ApiError(`Network error: ${message}`, 0, null);
    }
  }

  async get<T = unknown>(
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<T | null> {
    const searchParams = new URLSearchParams();
    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          searchParams.append(key, value.join(','));
        } else if (typeof value === 'string') {
          searchParams.append(key, value);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          searchParams.append(key, String(value));
        } else {
          searchParams.append(key, JSON.stringify(value));
        }
      }
    });

    const queryString = searchParams.toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    return this.request<T>(url, { method: 'GET' });
  }

  async post<T = unknown, B = unknown>(
    endpoint: string,
    data: B
  ): Promise<T | null> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data,
    });
  }

  async put<T = unknown, B = unknown>(
    endpoint: string,
    data: B
  ): Promise<T | null> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data,
    });
  }

  async delete<T = unknown, B = unknown>(endpoint: string, data?: B): Promise<T | null> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      body: data,
    });
  }
}

// Create singleton instance
const api = new ApiClient();

// Transaction API
export const transactionApi = {
  list: <T = unknown>(filters: Record<string, unknown> = {}) =>
    api.get<T>('/api/transactions', filters),
  get: <T = unknown>(id: string | number) => api.get<T>(`/api/transactions/${id}`),
  create: <T = unknown>(transaction: unknown) => api.post<T>('/api/transactions', transaction),
  update: <T = unknown>(id: string | number, transaction: unknown) =>
    api.put<T>(`/api/transactions/${id}`, transaction),
  delete: <T = unknown>(id: string | number) => api.delete<T>(`/api/transactions/${id}`),
  deleteMany: (ids: Array<string>) => api.delete<{ deleted: number }, { ids: Array<string> }>(`/api/transactions`, { ids }),
  recalc: (id: string, onlyMissing: boolean = true) =>
    api.post(
      `/api/transactions/${id}/recalc?only_missing=${onlyMissing ? 'true' : 'false'}`,
      {}
    ),
};

// Actions API
export const actionsApi = {
  perform: <T = unknown>(action: string, params: Record<string, unknown>) =>
    api.post<T>('/api/actions', { action, params }),
};

// Admin API
export const adminApi = {
  // Transaction Types
  listTypes: <T = unknown>() => api.get<T>('/api/admin/types'),
  getType: <T = unknown>(id: string | number) => api.get<T>(`/api/admin/types/${id}`),
  createType: <T = unknown>(type: unknown) => api.post<T>('/api/admin/types', type),
  updateType: <T = unknown>(id: string | number, type: unknown) =>
    api.put<T>(`/api/admin/types/${id}`, type),
  deleteType: <T = unknown>(id: string | number) => api.delete<T>(`/api/admin/types/${id}`),

  // Accounts
  listAccounts: <T = unknown>() => api.get<T>('/api/admin/accounts'),
  getAccount: <T = unknown>(id: string | number) => api.get<T>(`/api/admin/accounts/${id}`),
  createAccount: <T = unknown>(account: unknown) => api.post<T>('/api/admin/accounts', account),
  updateAccount: <T = unknown>(id: string | number, account: unknown) =>
    api.put<T>(`/api/admin/accounts/${id}`, account),
  deleteAccount: <T = unknown>(id: string | number) =>
    api.delete<T>(`/api/admin/accounts/${id}`),

  // Assets
  listAssets: <T = unknown>() => api.get<T>('/api/admin/assets'),
  getAsset: <T = unknown>(id: string | number) => api.get<T>(`/api/admin/assets/${id}`),
  createAsset: <T = unknown>(asset: unknown) => api.post<T>('/api/admin/assets', asset),
  updateAsset: <T = unknown>(id: string | number, asset: unknown) =>
    api.put<T>(`/api/admin/assets/${id}`, asset),
  deleteAsset: <T = unknown>(id: string | number) => api.delete<T>(`/api/admin/assets/${id}`),

  // Tags
  listTags: <T = unknown>() => api.get<T>('/api/admin/tags'),
  getTag: <T = unknown>(id: string | number) => api.get<T>(`/api/admin/tags/${id}`),
  createTag: <T = unknown>(tag: unknown) => api.post<T>('/api/admin/tags', tag),
  updateTag: <T = unknown>(id: string | number, tag: unknown) =>
    api.put<T>(`/api/admin/tags/${id}`, tag),
  deleteTag: <T = unknown>(id: string | number) => api.delete<T>(`/api/admin/tags/${id}`),

  // AI Pending Actions
  listPendingActions: <T = unknown>(params: { status?: string; limit?: number; offset?: number } = {}) =>
    api.get<T>('/api/admin/pending-actions', params),
  getPendingAction: <T = unknown>(id: string) =>
    api.get<T>(`/api/admin/pending-actions/${id}`),
  acceptPendingAction: <T = unknown>(id: string) =>
    api.post<T>(`/api/admin/pending-actions/${id}/accept`, {}),
  rejectPendingAction: <T = unknown>(id: string, reason?: string) =>
    api.post<T>(`/api/admin/pending-actions/${id}/reject`, { reason }),

  // Maintenance
  recalcFX: (onlyMissing: boolean = true) =>
    api.post(
      `/api/admin/maintenance/recalc-fx?only_missing=${onlyMissing ? 'true' : 'false'}`,
      {}
    ),
};

// FX Rates API
export const fxApi = {
  // Get today's FX rate
  getTodayRate: <T = unknown>(from = 'USD', to = 'VND') =>
    api.get<T>(`/api/fx/today?from=${from}&to=${to}`),

  // Get historical FX rates for a date range
  getHistory: <T = unknown>(params: {
    from?: string;
    to?: string;
    start?: string;
    end?: string;
  }) => api.get<T>('/api/fx/history', params),

  // Get FX rate for a specific date
  getHistoricalRate: <T = unknown>(from: string, to: string, date: string) =>
    api.get<T>(`/api/fx/history?from=${from}&to=${to}&start=${date}&end=${date}`),
};

// Price Population API
export const pricePopulationApi = {
  createJob: <T = unknown>(data: unknown) =>
    api.post<T>('/api/admin/price-population/jobs', data),
  getJobStatus: <T = unknown>(jobId: number) =>
    api.get<T>(`/api/admin/price-population/jobs?id=${jobId}`),
  listJobs: <T = unknown>(assetId: number) =>
    api.get<T>(`/api/admin/price-population/jobs?asset_id=${assetId}`),
};

// Reports API
export const reportsApi = {
  holdings: <T = unknown>(params: Record<string, unknown> = {}) =>
    api.get<T>('/api/reports/holdings', params),
  holdingsSummary: <T = unknown>(params: Record<string, unknown> = {}) =>
    api.get<T>('/api/reports/holdings/summary', params),
  cashFlow: <T = unknown>(params: Record<string, unknown> = {}) =>
    api.get<T>('/api/reports/cashflow', params),
  spending: <T = unknown>(params: Record<string, unknown> = {}) =>
    api.get<T>('/api/reports/spending', params),
  pnl: <T = unknown>(params: Record<string, unknown> = {}) =>
    api.get<T>('/api/reports/pnl', params),
};

// Health check
export const healthApi = {
  check: <T = unknown>() => api.get<T>('/health'),
};

// Vault API
export const vaultApi = {
  getActiveVaults: <T = unknown>() => api.get<T>('/api/vaults'),
  getVaultByName: <T = unknown>(name: string) => api.get<T>(`/api/vaults/${encodeURIComponent(name)}`),
  createVault: <T = unknown>(vault: unknown) => api.post<T>('/api/vaults', vault),
  depositToVault: <T = unknown>(name: string, deposit: unknown) => api.post<T>(`/api/vaults/${encodeURIComponent(name)}/deposit`, deposit),
  withdrawFromVault: <T = unknown>(name: string, withdrawal: unknown) => api.post<T>(`/api/vaults/${encodeURIComponent(name)}/withdraw`, withdrawal),
  endVault: <T = unknown>(name: string) => api.post<T>(`/api/vaults/${encodeURIComponent(name)}/end`, {}),
  deleteVault: <T = unknown>(name: string) => api.delete<T>(`/api/vaults/${encodeURIComponent(name)}`),
  refresh: <T = unknown>(name: string, data?: { current_value_usd?: number; current_unit_price_usd?: number; currency?: string; benchmark?: string; persist?: boolean }) =>
    api.post<T>(`/api/vaults/${encodeURIComponent(name)}/refresh`, data ?? {}),
};

export default api;
export { ApiError };

// Prices API (simple helper for daily spot price)
export const pricesApi = {
  // Returns array; we read last element's price
  daily: <T = unknown>(symbol: string, currency: string, start: string, end: string) =>
    api.get<T>('/api/prices/daily', { symbol, currency, start, end }),
};

// Tokenized Vault API
export const tokenizedVaultApi = {
  // Basic CRUD
  list: <T = unknown>(filters: Record<string, unknown> = {}) =>
    api.get<T>('/api/tokenized-vaults', filters),
  get: <T = unknown>(id: string, params: Record<string, unknown> = {}) =>
    api.get<T>(`/api/tokenized-vaults/${id}`, params),
  create: <T = unknown>(vault: unknown) => api.post<T>('/api/tokenized-vaults', vault),
  update: <T = unknown>(id: string, vault: unknown) => api.put<T>(`/api/tokenized-vaults/${id}`, vault),
  delete: <T = unknown>(id: string) => api.delete<T>(`/api/tokenized-vaults/${id}`),

  // Manual pricing
  updatePrice: <T = unknown>(id: string, data: { new_price: number; notes?: string }) =>
    api.post<T>(`/api/tokenized-vaults/${id}/update-price`, data),
  updateTotalValue: <T = unknown>(
    id: string,
    data: { total_value: number; net_contribution_delta?: number; notes?: string }
  ) =>
    api.post<T>(`/api/tokenized-vaults/${id}/update-total-value`, data),
  enableManualPricing: <T = unknown>(id: string, data: { initial_price: number }) =>
    api.post<T>(`/api/tokenized-vaults/${id}/enable-manual-pricing`, data),
  disableManualPricing: <T = unknown>(id: string) =>
    api.post<T>(`/api/tokenized-vaults/${id}/disable-manual-pricing`, {}),

  // Deposits and withdrawals
  deposit: <T = unknown>(id: string, data: { amount: number; notes?: string }) =>
    api.post<T>(`/api/tokenized-vaults/${id}/deposit`, data),
  withdraw: <T = unknown>(id: string, data: { amount: number; notes?: string }) =>
    api.post<T>(`/api/tokenized-vaults/${id}/withdraw`, data),

  // Vault management
  close: <T = unknown>(id: string) => api.post<T>(`/api/tokenized-vaults/${id}/close`, {}),
};

// Investments API
export const investmentsApi = {
  list: <T = unknown>(filters: Record<string, unknown> = {}) =>
    api.get<T>('/api/investments', filters),
  get: <T = unknown>(id: string) => api.get<T>(`/api/investments/${id}`),
  create: <T = unknown>(investment: unknown) => api.post<T>('/api/investments', investment),
  update: <T = unknown>(id: string, investment: unknown) =>
    api.put<T>(`/api/investments/${id}`, investment),
  delete: <T = unknown>(id: string) => api.delete<T>(`/api/investments/${id}`),
  summary: <T = unknown>(filters: Record<string, unknown> = {}) =>
    api.get<T>('/api/investments/summary', filters),

  // Stake-specific endpoints
  stake: <T = unknown>(stakeData: unknown) => api.post<T>('/api/investments/stake', stakeData),
  unstake: <T = unknown>(unstakeData: unknown) => api.post<T>('/api/investments/unstake', unstakeData),
  available: <T = unknown>(asset: string, account: string, horizon?: string) =>
    api.get<T>('/api/investments/available', { asset, account, horizon }),
};
