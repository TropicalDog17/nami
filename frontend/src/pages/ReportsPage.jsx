
import React, { useState, useEffect } from 'react'
import { reportsApi } from '../services/api'
import { useBackendStatus } from '../context/BackendStatusContext'
import { HoldingsChart, CashFlowChart, SpendingChart, PnLChart, SummaryStats } from '../components/reports/Charts'

const ReportsPage = () => {
  const [currency, setCurrency] = useState('USD')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    holdings: null,
    cashFlow: null,
    spending: null,
    pnl: null,
  })

  const [dateRange, setDateRange] = useState('30') // days
  const { isOnline, retryConnection } = useBackendStatus()

  useEffect(() => {
    if (isOnline) {
      fetchReportsData()
    } else {
      setError('Backend is offline. Please check your connection.')
      setLoading(false)
    }
  }, [dateRange, isOnline])

  const fetchReportsData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [holdings, cashFlow, spending, pnl] = await Promise.all([
        reportsApi.holdingsSummary(),
        reportsApi.cashFlow({ days: dateRange }),
        reportsApi.spending({ days: dateRange }),
        reportsApi.pnl({ days: dateRange }),
      ])

      setData({
        holdings,
        cashFlow,
        spending,
        pnl,
      })
    } catch (err) {
      setError(err.message)
      console.error('Failed to fetch reports data:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
        </div>
      </div>
    )
  }

  if (error) {
    const isBackendOffline = !isOnline || error.includes('offline') || error.includes('Network error')
    
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className={`border rounded-md p-6 ${
          isBackendOffline 
            ? 'bg-orange-50 border-orange-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 mb-4">
              {isBackendOffline ? (
                <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              ) : (
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
            </div>
            
            <h3 className={`text-lg font-medium mb-2 ${
              isBackendOffline ? 'text-orange-800' : 'text-red-800'
            }`}>
              {isBackendOffline ? 'Backend Service Unavailable' : 'Error Loading Reports'}
            </h3>
            
            <div className={`text-sm mb-6 ${
              isBackendOffline ? 'text-orange-700' : 'text-red-700'
            }`}>
              <p className="mb-2">{error}</p>
              {isBackendOffline && (
                <p>The reports service is currently offline. Please wait while we try to reconnect automatically, or try refreshing the page.</p>
              )}
            </div>
            
            <div className="flex justify-center space-x-3">
              <button
                onClick={isBackendOffline ? retryConnection : fetchReportsData}
                disabled={loading}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isBackendOffline
                    ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 disabled:opacity-50'
                    : 'bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50'
                }`}
              >
                {loading ? 'Retrying...' : isBackendOffline ? 'Check Connection' : 'Try Again'}
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const holdingsStats = data.holdings ? [
    {
      label: 'Total Value',
      value: parseFloat(currency === 'USD' ? data.holdings.total_value_usd : data.holdings.total_value_vnd),
    },
    {
      label: 'Number of Assets',
      value: `${Object.keys(data.holdings.by_asset || {}).length} assets`,
    },
    {
      label: 'Number of Accounts',
      value: `${Object.keys(data.holdings.by_account || {}).length} accounts`,
    },
  ] : []

  const cashFlowStats = data.cashFlow ? [
    {
      label: 'Total Inflow',
      value: parseFloat(currency === 'USD' ? data.cashFlow.total_in_usd : data.cashFlow.total_in_vnd),
    },
    {
      label: 'Total Outflow',
      value: -parseFloat(currency === 'USD' ? data.cashFlow.total_out_usd : data.cashFlow.total_out_vnd),
    },
    {
      label: 'Net Cash Flow',
      value: parseFloat(currency === 'USD' ? data.cashFlow.net_usd : data.cashFlow.net_vnd),
    },
  ] : []

  const spendingStats = data.spending ? [
    {
      label: 'Total Spending',
      value: -parseFloat(currency === 'USD' ? data.spending.total_usd : data.spending.total_vnd),
    },
    {
      label: 'Categories',
      value: `${Object.keys(data.spending.by_tag || {}).length} categories`,
    },
    {
      label: 'Top Expense',
      value: data.spending.top_expenses && data.spending.top_expenses[0] 
        ? `${data.spending.top_expenses[0].counterparty || 'Unknown'}: ${parseFloat(currency === 'USD' ? data.spending.top_expenses[0].amount_usd : data.spending.top_expenses[0].amount_vnd).toLocaleString()} ${currency}`
        : 'No expenses',
    },
  ] : []

  const pnlStats = data.pnl ? [
    {
      label: 'Realized P&L',
      value: parseFloat(currency === 'USD' ? data.pnl.realized_pnl_usd : data.pnl.realized_pnl_vnd),
    },
    {
      label: 'Unrealized P&L',
      value: parseFloat(currency === 'USD' ? data.pnl.unrealized_pnl_usd : data.pnl.unrealized_pnl_vnd),
    },
    {
      label: 'Total P&L',
      value: parseFloat(currency === 'USD' ? data.pnl.total_pnl_usd : data.pnl.total_pnl_vnd),
    },
    {
      label: 'ROI',
      value: `${parseFloat(data.pnl.roi_percent).toFixed(2)}%`,
    },
  ] : []

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-gray-600">
              Financial insights and performance analysis
            </p>
          </div>
          <div className="flex space-x-4">
            {/* Date Range Selector */}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
            
            {/* Currency Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setCurrency('USD')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  currency === 'USD'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                USD
              </button>
              <button
                onClick={() => setCurrency('VND')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  currency === 'VND'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                VND
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Compact Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Holdings */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Holdings</h2>
            <div className="text-sm text-gray-500">
              {data.holdings ? `${Object.keys(data.holdings.by_asset || {}).length} assets` : ''}
            </div>
          </div>
          <div className="h-64 mb-3">
            <HoldingsChart data={data.holdings} currency={currency} />
          </div>
          <div className="text-center">
            <span className={`text-lg font-bold ${
              (data.holdings ? parseFloat(currency === 'USD' ? data.holdings.total_value_usd : data.holdings.total_value_vnd) : 0) >= 0 
                ? 'text-green-600' : 'text-red-600'
            }`}>
              {data.holdings 
                ? `${parseFloat(currency === 'USD' ? data.holdings.total_value_usd : data.holdings.total_value_vnd).toLocaleString()} ${currency}`
                : '0 ' + currency
              }
            </span>
            <div className="text-sm text-gray-500">Total Value</div>
          </div>
        </div>

        {/* Cash Flow */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Cash Flow</h2>
            <div className="text-sm text-gray-500">{dateRange} days</div>
          </div>
          <div className="h-64 mb-3">
            <CashFlowChart data={data.cashFlow} currency={currency} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <div className="font-medium text-green-600">
                {data.cashFlow ? parseFloat(currency === 'USD' ? data.cashFlow.total_in_usd : data.cashFlow.total_in_vnd).toLocaleString() : '0'}
              </div>
              <div className="text-gray-500">In</div>
            </div>
            <div>
              <div className="font-medium text-red-600">
                {data.cashFlow ? parseFloat(currency === 'USD' ? data.cashFlow.total_out_usd : data.cashFlow.total_out_vnd).toLocaleString() : '0'}
              </div>
              <div className="text-gray-500">Out</div>
            </div>
            <div>
              <div className={`font-medium ${
                (data.cashFlow ? parseFloat(currency === 'USD' ? data.cashFlow.net_usd : data.cashFlow.net_vnd) : 0) >= 0 
                  ? 'text-green-600' : 'text-red-600'
              }`}>
                {data.cashFlow ? parseFloat(currency === 'USD' ? data.cashFlow.net_usd : data.cashFlow.net_vnd).toLocaleString() : '0'}
              </div>
              <div className="text-gray-500">Net</div>
            </div>
          </div>
        </div>

        {/* Spending */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Spending</h2>
            <div className="text-sm text-gray-500">
              {data.spending ? `${Object.keys(data.spending.by_tag || {}).length} categories` : ''}
            </div>
          </div>
          <div className="h-64 mb-3">
            <SpendingChart data={data.spending} currency={currency} />
          </div>
          <div className="text-center">
            <span className="text-lg font-bold text-red-600">
              {data.spending 
                ? `${parseFloat(currency === 'USD' ? data.spending.total_usd : data.spending.total_vnd).toLocaleString()} ${currency}`
                : '0 ' + currency
              }
            </span>
            <div className="text-sm text-gray-500">Total Spending</div>
          </div>
        </div>

        {/* P&L */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-900">P&L</h2>
            <div className="text-sm text-gray-500">
              ROI: {data.pnl ? `${parseFloat(data.pnl.roi_percent).toFixed(1)}%` : '0%'}
            </div>
          </div>
          <div className="h-64 mb-3">
            <PnLChart data={data.pnl} currency={currency} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            <div>
              <div className={`font-medium ${
                (data.pnl ? parseFloat(currency === 'USD' ? data.pnl.realized_pnl_usd : data.pnl.realized_pnl_vnd) : 0) >= 0 
                  ? 'text-green-600' : 'text-red-600'
              }`}>
                {data.pnl ? parseFloat(currency === 'USD' ? data.pnl.realized_pnl_usd : data.pnl.realized_pnl_vnd).toLocaleString() : '0'}
              </div>
              <div className="text-gray-500">Realized</div>
            </div>
            <div>
              <div className={`font-medium ${
                (data.pnl ? parseFloat(currency === 'USD' ? data.pnl.total_pnl_usd : data.pnl.total_pnl_vnd) : 0) >= 0 
                  ? 'text-green-600' : 'text-red-600'
              }`}>
                {data.pnl ? parseFloat(currency === 'USD' ? data.pnl.total_pnl_usd : data.pnl.total_pnl_vnd).toLocaleString() : '0'}
              </div>
              <div className="text-gray-500">Total</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReportsPage
