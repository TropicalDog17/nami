import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { formatCurrency, formatPercentage, formatPnL } from '../../utils/currencyFormatter';

interface PnLData {
  realized_pnl_usd: number;
  realized_pnl_vnd: number;
  unrealized_pnl_usd: number;
  unrealized_pnl_vnd: number;
  total_pnl_usd: number;
  total_pnl_vnd: number;
  total_cost_basis: number;
  total_value: number;
  roi_percentage: number;
}

interface PnLDisplayProps {
  data: PnLData;
  currency: string;
  period?: string;
}

const PnLDisplay: React.FC<PnLDisplayProps> = ({
  data,
  currency,
  period = 'Selected Period'
}) => {
  const isUSD = currency === 'USD';

  const realizedPnL = isUSD ? data.realized_pnl_usd : data.realized_pnl_vnd;
  const unrealizedPnL = isUSD ? data.unrealized_pnl_usd : data.unrealized_pnl_vnd;
  const totalPnL = isUSD ? data.total_pnl_usd : data.total_pnl_vnd;
  const totalCost = data.total_cost_basis;
  const totalValue = data.total_value;
  const roiPercentage = data.roi_percentage / 100; // Convert from basis points

  const realizedPnLFormatted = formatPnL(realizedPnL, currency);
  const unrealizedPnLFormatted = formatPnL(unrealizedPnL, currency);
  const totalPnLFormatted = formatPnL(totalPnL, currency);

  return (
    <div className="space-y-6">
      {/* Title */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">
            Profit & Loss - {period}
          </CardTitle>
          <p className="text-sm text-gray-500">
            Investment performance breakdown
          </p>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Realized PnL */}
        <Card>
          <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Realized PnL</p>
              <p className={`text-2xl font-bold ${realizedPnLFormatted.colorClass} mt-2`}>
                {realizedPnLFormatted.sign}{realizedPnLFormatted.value}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </CardContent>
        </Card>

        {/* Unrealized PnL */}
        <Card>
          <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Unrealized PnL</p>
              <p className={`text-2xl font-bold ${unrealizedPnLFormatted.colorClass} mt-2`}>
                {unrealizedPnLFormatted.sign}{unrealizedPnLFormatted.value}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        </CardContent>
        </Card>

        {/* Total PnL */}
        <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-lg border border-indigo-200">
          <CardContent className="p-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-indigo-800">Total PnL</p>
              <p className={`text-2xl font-bold ${totalPnLFormatted.isPositive ? 'text-green-700' : totalPnLFormatted.isNegative ? 'text-red-700' : 'text-gray-700'} mt-2`}>
                {totalPnLFormatted.sign}{totalPnLFormatted.value}
              </p>
            </div>
            <div className="p-3 bg-indigo-100 rounded-full">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown */}
      <Card>
        <CardContent className="p-6">
        <h4 className="text-md font-medium text-gray-900 mb-6">Performance Breakdown</h4>

        <div className="space-y-6">
          {/* ROI */}
          <div className="flex justify-between items-center py-4 border-b border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-900">Return on Investment (ROI)</p>
              <p className="text-xs text-gray-500">
                {formatCurrency(totalCost, currency)} → {formatCurrency(totalValue, currency)}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${roiPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {roiPercentage >= 0 ? '+' : ''}{formatPercentage(roiPercentage, 2)}
              </p>
            </div>
          </div>

          {/* Cost Basis */}
          <div className="flex justify-between items-center py-4 border-b border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-900">Total Cost Basis</p>
              <p className="text-xs text-gray-500">Initial investment amount</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-medium text-gray-900">
                {formatCurrency(totalCost, currency)}
              </p>
            </div>
          </div>

          {/* Current Value */}
          <div className="flex justify-between items-center py-4 border-b border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-900">Current Value</p>
              <p className="text-xs text-gray-500">Market value of holdings</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-medium text-gray-900">
                {formatCurrency(totalValue, currency)}
              </p>
            </div>
          </div>

          {/* Realized PnL Detail */}
          <div className="flex justify-between items-center py-4 border-b border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-900">Realized Gains/Losses</p>
              <p className="text-xs text-gray-500">From closed positions</p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-medium ${realizedPnLFormatted.colorClass}`}>
                {realizedPnLFormatted.sign}{realizedPnLFormatted.value}
              </p>
            </div>
          </div>

          {/* Unrealized PnL Detail */}
          <div className="flex justify-between items-center py-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Unrealized Gains/Losses</p>
              <p className="text-xs text-gray-500">From open positions</p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-medium ${unrealizedPnLFormatted.colorClass}`}>
                {unrealizedPnLFormatted.sign}{unrealizedPnLFormatted.value}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
      </Card>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="text-center p-4 bg-gray-50 rounded-lg">
          <CardContent className="p-0">
          <p className="text-sm text-gray-600">Win Rate</p>
          <p className="text-xl font-bold text-gray-900">
            {totalPnL > 0 ? 'Profitable' : totalPnL < 0 ? 'Loss' : 'Breakeven'}
          </p>
        </CardContent>
        </Card>
        <Card className="text-center p-4 bg-gray-50 rounded-lg">
          <CardContent className="p-0">
          <p className="text-sm text-gray-600">Performance</p>
          <p className={`text-xl font-bold ${totalPnL > 0 ? 'text-green-600' : totalPnL < 0 ? 'text-red-600' : 'text-gray-600'}`}>
            {totalPnL > 0 ? '📈' : totalPnL < 0 ? '📉' : '➡️'}
          </p>
        </CardContent>
        </Card>
        <Card className="text-center p-4 bg-gray-50 rounded-lg">
          <CardContent className="p-0">
          <p className="text-sm text-gray-600">Efficiency</p>
          <p className="text-xl font-bold text-gray-900">
            {totalCost > 0 ? formatPercentage(totalPnL / totalCost, 1) : 'N/A'}
          </p>
        </CardContent>
        </Card>
        <Card className="text-center p-4 bg-gray-50 rounded-lg">
          <CardContent className="p-0">
          <p className="text-sm text-gray-600">Total Return</p>
          <p className={`text-xl font-bold ${totalPnLFormatted.colorClass}`}>
            {totalPnLFormatted.sign}{formatPercentage(totalPnL / totalCost, 1)}
          </p>
        </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PnLDisplay;