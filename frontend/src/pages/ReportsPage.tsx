import React, { useState, useEffect } from 'react';
import DateInput from '../components/ui/DateInput';

import DataTable from '../components/ui/DataTable';
import { useBackendStatus } from '../context/BackendStatusContext';
import { reportsApi } from '../services/api';

const ReportsPage = () => {
  const [activeTab, setActiveTab] = useState('holdings');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>({});

  // Filters
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0], // today
    asOf: new Date().toISOString().split('T')[0],
    period: '30', // days
    asset: '',
    account: '',
    tag: '',
    type: '',
  });

  const { isOnline } = useBackendStatus() as any;

  const tabs = [
    { id: 'holdings', name: 'Holdings', icon: '📊' },
    { id: 'cashflow', name: 'Cash Flow', icon: '💸' },
    { id: 'spending', name: 'Spending', icon: '🛒' },
    { id: 'pnl', name: 'P&L', icon: '📈' },
  ];

  useEffect(() => {
    if (isOnline) {
      fetchData();
    }
  }, [activeTab, filters, currency, isOnline]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      let result = null;

      switch (activeTab) {
        case 'holdings':
          result = await reportsApi.holdings({ as_of: filters.asOf });
          break;
        case 'cashflow':
          result = await reportsApi.cashFlow({
            start_date: filters.startDate,
            end_date: filters.endDate,
          });
          break;
        case 'spending':
          result = await reportsApi.spending({
            start_date: filters.startDate,
            end_date: filters.endDate,
          });
          break;
        case 'pnl':
          result = await reportsApi.pnl({
            start_date: filters.startDate,
            end_date: filters.endDate,
          });
          break;
      }

      setData((prev: any) => ({ ...prev, [activeTab]: result }));
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in (err as any)
        ? String((err as any).message)
        : String(err);
      setError(`Failed to load ${activeTab}: ${message}`);
      console.error('Reports fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: any, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const renderFilters = () => {
    return (
      <div
        className="bg-white p-4 rounded-lg shadow mb-6"
        data-testid="reports-filters"
      >
        <h3
          className="text-lg font-medium text-gray-900 mb-4"
          data-testid="reports-filters-title"
        >
          Filters
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Currency Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Currency
            </label>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrency('USD')}
                className={`px-3 py-2 rounded text-sm font-medium ${
                  currency === 'USD'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                data-testid="currency-usd-button"
              >
                USD
              </button>
              <button
                onClick={() => setCurrency('VND')}
                className={`px-3 py-2 rounded text-sm font-medium ${
                  currency === 'VND'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                data-testid="currency-vnd-button"
              >
                VND
              </button>
            </div>
          </div>

          {/* Date Filters */}
          {(activeTab === 'cashflow' ||
            activeTab === 'spending' ||
            activeTab === 'pnl') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <DateInput value={filters.startDate} onChange={(v) => handleFilterChange('startDate', v)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <DateInput value={filters.endDate} onChange={(v) => handleFilterChange('endDate', v)} />
              </div>
            </>
          )}

          {/* As Of Date for Holdings */}
          {activeTab === 'holdings' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">As Of Date</label>
              <DateInput value={filters.asOf} onChange={(v) => handleFilterChange('asOf', v)} />
            </div>
          )}

          {/* Quick Date Presets */}
          {(activeTab === 'cashflow' ||
            activeTab === 'spending' ||
            activeTab === 'pnl') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quick Presets
              </label>
              <select
                onChange={(e) => {
                  const days = parseInt(e.target.value);
                  const endDate = new Date().toISOString().split('T')[0];
                  const startDate = new Date(
                    Date.now() - days * 24 * 60 * 60 * 1000
                  )
                    .toISOString()
                    .split('T')[0];
                  setFilters((prev) => ({ ...prev, startDate, endDate }));
                }}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">Custom Range</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="365">Last Year</option>
              </select>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHoldingsTable = () => {
    const holdings = (data as any).holdings || [];

    const columns = [
      { key: 'asset', title: 'Asset' },
      { key: 'account', title: 'Account' },
      {
        key: 'quantity',
        title: 'Quantity',
        type: 'number',
        render: (value: any) => parseFloat(value || 0).toLocaleString(),
      },
      {
        key: currency === 'USD' ? 'value_usd' : 'value_vnd',
        title: `Value (${currency})`,
        type: 'currency',
        currency: currency,
        render: (value: any) => {
          const num = parseFloat(value || 0);
          return currency === 'USD'
            ? `$${num.toLocaleString()}`
            : `₫${num.toLocaleString()}`;
        },
      },
      {
        key: 'last_updated',
        title: 'Last Updated',
        type: 'date',
        render: (value: any) => new Date(value).toLocaleDateString(),
      },
    ];

    return (
      <DataTable
        data={holdings}
        columns={columns}
        loading={loading}
        emptyMessage="No holdings found"
        filterable={true}
        sortable={true}
        pagination={true}
      />
    );
  };

  const renderCashFlowTable = () => {
    const cashFlow: any = (data as any).cashflow || {};
    type CashRow = {
      type: string;
      inflow_usd?: number | string;
      outflow_usd?: number | string;
      net_usd?: number | string;
      inflow_vnd?: number | string;
      outflow_vnd?: number | string;
      net_vnd?: number | string;
      count?: number;
      [key: string]: any;
    };
    let allRows: CashRow[] = Object.entries(cashFlow.by_type || {}).map(
      ([type, d]: [string, any]) => ({ type, ...(d as any) })
    );

    // For borrow, inflow is tracked in amount fields not cashflow; override so the row reflects real inflow
    allRows = allRows.map((row) => {
      if (row.type === 'borrow') {
        const inflowUSD = parseFloat(String((cashFlow as any).financing_in_usd ?? 0));
        const inflowVND = parseFloat(String((cashFlow as any).financing_in_vnd ?? 0));
        return {
          ...row,
          inflow_usd: inflowUSD,
          inflow_vnd: inflowVND,
          // keep existing outflow fields as-is; net will be computed from dataset columns in UI
        } as CashRow;
      }
      return row;
    });

    // Split into Operating vs Financing rows
    const financingTypes = new Set(['borrow', 'repay_borrow', 'interest_expense']);
    const financingRows: CashRow[] = allRows.filter((r: CashRow) => financingTypes.has(r.type));
    const operatingRows: CashRow[] = allRows.filter((r: CashRow) => !financingTypes.has(r.type));

    // Helper to compute section subtotals based on current currency
    const computeTotals = (rows: CashRow[]) => {
      const keyIn = currency === 'USD' ? 'inflow_usd' : 'inflow_vnd';
      const keyOut = currency === 'USD' ? 'outflow_usd' : 'outflow_vnd';
      const keyNet = currency === 'USD' ? 'net_usd' : 'net_vnd';
      const totals = rows.reduce(
        (acc: { inflow: number; outflow: number; net: number; count: number }, r: CashRow) => ({
          inflow: acc.inflow + parseFloat(String(r[keyIn] ?? 0)),
          outflow: acc.outflow + parseFloat(String(r[keyOut] ?? 0)),
          net: acc.net + parseFloat(String(r[keyNet] ?? 0)),
          count: acc.count + (r.count || 0),
        }),
        { inflow: 0, outflow: 0, net: 0, count: 0 }
      );
      return totals;
    };

    const columns = [
      { key: 'type', title: 'Transaction Type' },
      {
        key: currency === 'USD' ? 'inflow_usd' : 'inflow_vnd',
        title: `Inflow (${currency})`,
        type: 'currency',
        render: (value: any) => {
          const num = parseFloat(value || 0);
          return currency === 'USD'
            ? `$${num.toLocaleString()}`
            : `₫${num.toLocaleString()}`;
        },
      },
      {
        key: currency === 'USD' ? 'outflow_usd' : 'outflow_vnd',
        title: `Outflow (${currency})`,
        type: 'currency',
        render: (value: any) => {
          const num = parseFloat(value || 0);
          return currency === 'USD'
            ? `$${num.toLocaleString()}`
            : `₫${num.toLocaleString()}`;
        },
      },
      {
        key: currency === 'USD' ? 'net_usd' : 'net_vnd',
        title: `Net (${currency})`,
        type: 'currency',
        render: (value: any) => {
          const num = parseFloat(value || 0);
          const formatted =
            currency === 'USD'
              ? `$${Math.abs(num).toLocaleString()}`
              : `₫${Math.abs(num).toLocaleString()}`;
          return num >= 0 ? `+${formatted}` : `-${formatted}`;
        },
      },
      {
        key: 'count',
        title: 'Transactions',
        type: 'number',
      },
    ];

    return (
      <div>
        {/* Summary Stats - Combined */}
        {cashFlow.total_in_usd !== undefined && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-green-800">
                Combined Inflow
              </h4>
              <p className="text-2xl font-bold text-green-900">
                {currency === 'USD'
                  ? `$${parseFloat((cashFlow.combined_in_usd ?? cashFlow.total_in_usd) || 0).toLocaleString()}`
                  : `₫${parseFloat((cashFlow.combined_in_vnd ?? cashFlow.total_in_vnd) || 0).toLocaleString()}`}
              </p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-red-800">
                Combined Outflow
              </h4>
              <p className="text-2xl font-bold text-red-900">
                {currency === 'USD'
                  ? `$${parseFloat((cashFlow.combined_out_usd ?? cashFlow.total_out_usd) || 0).toLocaleString()}`
                  : `₫${parseFloat((cashFlow.combined_out_vnd ?? cashFlow.total_out_vnd) || 0).toLocaleString()}`}
              </p>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-blue-800">Combined Net</h4>
              <p className="text-2xl font-bold text-blue-900">
                {currency === 'USD'
                  ? `$${parseFloat((cashFlow.combined_net_usd ?? cashFlow.net_usd) || 0).toLocaleString()}`
                  : `₫${parseFloat((cashFlow.combined_net_vnd ?? cashFlow.net_vnd) || 0).toLocaleString()}`}
              </p>
            </div>
          </div>
        )}

        {/* Secondary: Operating vs Financing */}
        {cashFlow.operating_in_usd !== undefined && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-800 mb-2">Operating</h4>
              <div className="flex items-center justify-between text-sm">
                <span>Inflow</span>
                <span>
                  {currency === 'USD'
                    ? `$${parseFloat(cashFlow.operating_in_usd || 0).toLocaleString()}`
                    : `₫${parseFloat(cashFlow.operating_in_vnd || 0).toLocaleString()}`}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Outflow</span>
                <span>
                  {currency === 'USD'
                    ? `$${parseFloat(cashFlow.operating_out_usd || 0).toLocaleString()}`
                    : `₫${parseFloat(cashFlow.operating_out_vnd || 0).toLocaleString()}`}
                </span>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span>Net</span>
                <span>
                  {currency === 'USD'
                    ? `$${parseFloat(cashFlow.operating_net_usd || 0).toLocaleString()}`
                    : `₫${parseFloat(cashFlow.operating_net_vnd || 0).toLocaleString()}`}
                </span>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-800 mb-2">Financing</h4>
              <div className="flex items-center justify-between text-sm">
                <span>Inflow (Borrow)</span>
                <span>
                  {currency === 'USD'
                    ? `$${parseFloat(cashFlow.financing_in_usd || 0).toLocaleString()}`
                    : `₫${parseFloat(cashFlow.financing_in_vnd || 0).toLocaleString()}`}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Outflow (Repay + Interest)</span>
                <span>
                  {currency === 'USD'
                    ? `$${parseFloat(cashFlow.financing_out_usd || 0).toLocaleString()}`
                    : `₫${parseFloat(cashFlow.financing_out_vnd || 0).toLocaleString()}`}
                </span>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span>Net</span>
                <span>
                  {currency === 'USD'
                    ? `$${parseFloat(cashFlow.financing_net_usd || 0).toLocaleString()}`
                    : `₫${parseFloat(cashFlow.financing_net_vnd || 0).toLocaleString()}`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Operating section */}
        <div className="space-y-2 mb-8">
          <div className="flex items-center justify-between">
            <h4 className="text-md font-semibold text-gray-900">Operating Cash Flows</h4>
            {operatingRows.length > 0 && (
              (() => {
                const t = computeTotals(operatingRows);
                const fmt = (n: number) =>
                  currency === 'USD'
                    ? `$${Math.abs(n).toLocaleString()}`
                    : `₫${Math.abs(n).toLocaleString()}`;
                return (
                  <div className="text-sm text-gray-700 flex items-center gap-4">
                    <span>In: {fmt(t.inflow)}</span>
                    <span>Out: {fmt(t.outflow)}</span>
                    <span>
                      Net: {t.net >= 0 ? '+' : '-'}{fmt(t.net)}
                    </span>
                    <span>Tx: {t.count}</span>
                  </div>
                );
              })()
            )}
          </div>
          <DataTable
            data={operatingRows}
            columns={columns}
            loading={loading}
            emptyMessage="No operating cash flows"
            filterable={true}
            sortable={true}
            pagination={true}
          />
        </div>

        {/* Financing section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-md font-semibold text-gray-900">Financing Cash Flows</h4>
            {financingRows.length > 0 && (
              (() => {
                const t = computeTotals(financingRows);
                const fmt = (n: number) =>
                  currency === 'USD'
                    ? `$${Math.abs(n).toLocaleString()}`
                    : `₫${Math.abs(n).toLocaleString()}`;
                return (
                  <div className="text-sm text-gray-700 flex items-center gap-4">
                    <span>In: {fmt(t.inflow)}</span>
                    <span>Out: {fmt(t.outflow)}</span>
                    <span>
                      Net: {t.net >= 0 ? '+' : '-'}{fmt(t.net)}
                    </span>
                    <span>Tx: {t.count}</span>
                  </div>
                );
              })()
            )}
          </div>
          <DataTable
            data={financingRows}
            columns={columns}
            loading={loading}
            emptyMessage="No financing cash flows"
            filterable={true}
            sortable={true}
            pagination={true}
          />
        </div>
      </div>
    );
  };

  const renderSpendingTable = () => {
    const spending: any = (data as any).spending || {};
    const byTag = Object.entries(spending.by_tag || {}).map(([tag, data]: [string, any]) => ({
      tag,
      ...data,
    }));

    const columns = [
      { key: 'tag', title: 'Tag' },
      {
        key: currency === 'USD' ? 'amount_usd' : 'amount_vnd',
        title: `Amount (${currency})`,
        type: 'currency',
        render: (value: any) => {
          const num = parseFloat(value || 0);
          return currency === 'USD'
            ? `$${num.toLocaleString()}`
            : `₫${num.toLocaleString()}`;
        },
      },
      {
        key: 'percentage',
        title: 'Percentage',
        render: (value: any) => `${parseFloat(value || 0).toFixed(1)}%`,
      },
      {
        key: 'count',
        title: 'Transactions',
        type: 'number',
      },
    ];

    return (
      <div>
        {/* Total Spending */}
        {spending.total_usd !== undefined && (
          <div className="bg-orange-50 p-4 rounded-lg mb-6">
            <h4 className="text-sm font-medium text-orange-800">
              Total Spending
            </h4>
            <p className="text-3xl font-bold text-orange-900">
              {currency === 'USD'
                ? `$${parseFloat(spending.total_usd || 0).toLocaleString()}`
                : `₫${parseFloat(spending.total_vnd || 0).toLocaleString()}`}
            </p>
          </div>
        )}

        <DataTable
          data={byTag}
          columns={columns}
          loading={loading}
          emptyMessage="No spending data found"
          filterable={true}
          sortable={true}
          pagination={true}
        />
      </div>
    );
  };

  const renderPnLTable = () => {
    const pnl: any = (data as any).pnl || {};

    return (
      <div>
        {/* P&L Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-blue-800">Realized P&L</h4>
            <p className="text-2xl font-bold text-blue-900">
              {currency === 'USD'
                ? `$${parseFloat(pnl.realized_pnl_usd || 0).toLocaleString()}`
                : `₫${parseFloat(pnl.realized_pnl_vnd || 0).toLocaleString()}`}
            </p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-purple-800">Total P&L</h4>
            <p className="text-2xl font-bold text-purple-900">
              {currency === 'USD'
                ? `$${parseFloat(pnl.total_pnl_usd || 0).toLocaleString()}`
                : `₫${parseFloat(pnl.total_pnl_vnd || 0).toLocaleString()}`}
            </p>
          </div>
        </div>

        {pnl.roi_percent !== undefined && (
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-800">
              Return on Investment (ROI)
            </h4>
            <p className="text-xl font-bold text-gray-900">
              {parseFloat(pnl.roi_percent || 0).toFixed(2)}%
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (!isOnline) {
      return (
        <div className="bg-orange-50 border border-orange-200 rounded-md p-4 text-center">
          <p className="text-orange-800">
            Backend is offline. Please check your connection.
          </p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-center">
          <p className="text-red-800">{error}</p>
          <button
            onClick={fetchData}
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'holdings':
        return renderHoldingsTable();
      case 'cashflow':
        return renderCashFlowTable();
      case 'spending':
        return renderSpendingTable();
      case 'pnl':
        return renderPnLTable();
      default:
        return <div>Select a report type</div>;
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1
          className="text-2xl font-bold text-gray-900"
          data-testid="reports-page-title"
        >
          Reports & Analytics
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          View comprehensive financial reports including holdings, cash flow analysis, and profit & loss statements.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              data-testid={`reports-tab-${tab.id}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Filters */}
      {renderFilters()}

      {/* Content */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2
            className="text-lg font-medium text-gray-900 mb-4"
            data-testid={`reports-section-title-${activeTab}`}
          >
            {tabs.find((t) => t.id === activeTab)?.name} Report
          </h2>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
