import React from 'react';

import { formatCurrency, formatPercentage } from '../../utils/currencyFormatter';

interface AssetData {
  [key: string]: {
    quantity: number;
    value_usd?: number;
    value_vnd?: number;
    percentage: number;
  };
}

interface AssetAllocationChartProps {
  data: {
    by_asset: AssetData;
    total_value_usd?: number;
    total_value_vnd?: number;
  };
  currency: string;
}

const AssetAllocationChart: React.FC<AssetAllocationChartProps> = ({
  data,
  currency,
}) => {
  const assets = Object.entries(data.by_asset ?? {})
    .map(([asset, info]) => {
      const value = currency === 'USD' ? (info.value_usd ?? 0) : (info.value_vnd ?? 0);
      // Display rule: For USD vaults, show actual currency amount instead of vault share count
      const isUsdVault = asset.toUpperCase().startsWith('USD') && asset.toLowerCase().includes('(vault)');
      const quantityForDisplay = isUsdVault ? value : (info.quantity || 0);
      return {
        asset,
        value,
        percentage: parseFloat(info.percentage?.toString() || '0') || 0,
        quantity: quantityForDisplay,
      };
    })
    .filter(asset => asset.value > 0) // Only show assets with value
    .sort((a, b) => b.value - a.value);

  const totalValue =
    currency === 'USD' ? (data.total_value_usd ?? 0) : (data.total_value_vnd ?? 0);

  const getAllocationColor = (percentage: number) => {
    if (percentage > 50) return 'bg-blue-500';
    if (percentage > 25) return 'bg-green-500';
    if (percentage > 10) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  // Helper function to get quantity decimal places based on asset type
  const getQuantityDecimals = (asset: string): number => {
    const cryptoAssets = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'ADA', 'DOT', 'SOL', 'MATIC'];
    const upper = asset.toUpperCase();
    if (cryptoAssets.includes(upper)) return 8;
    // USD-style assets (e.g., 'USD', 'USD (vault)') should render like fiat
    if (upper === 'USD' || (upper.startsWith('USD') && upper.includes('(VAULT)'))) return 2;
    return 4;
  };

  if (assets.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Asset Allocation</h3>
          <p className="text-sm text-gray-500">Portfolio diversification by asset</p>
        </div>
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
          <p className="text-center text-gray-500">No assets to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h3 className="text-lg font-medium text-gray-900">Asset Allocation</h3>
        <p className="text-sm text-gray-500">
          Portfolio diversification by asset
        </p>
      </div>

      {/* Total Portfolio Value */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200" data-testid="total-portfolio-value">
        <div className="text-center">
          <p className="text-sm font-medium text-blue-800 mb-2">
            Total Portfolio Value
          </p>
          <p className="text-4xl font-bold text-blue-900">
            {formatCurrency(totalValue, currency)}
          </p>
        </div>
      </div>

      {/* Horizontal Bar Chart */}
      <div className="bg-white p-6 rounded-lg border border-gray-200" data-testid="asset-breakdown">
        <h4 className="text-md font-medium text-gray-900 mb-4">
          Allocation Breakdown
        </h4>
        <div className="space-y-3">
          {assets.map((asset, _index) => (
            <div key={asset.asset} className="space-y-2" data-testid={`asset-${asset.asset}`}>
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-3 h-3 rounded-full ${getAllocationColor(asset.percentage)}`}
                  />
                  <span className="font-medium text-gray-900">
                    {asset.asset}
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatCurrency(asset.quantity, asset.asset, {
                      symbolPosition: 'after',
                      decimalPlaces: getQuantityDecimals(asset.asset),
                      symbol: ''
                    })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-medium text-gray-900">
                    {formatCurrency(asset.value, currency)}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">
                    ({formatPercentage(asset.percentage / 100, 1)})
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${getAllocationColor(asset.percentage)}`}
                  style={{ width: `${Math.min(asset.percentage, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Allocation Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Assets</p>
          <p className="text-xl font-bold text-gray-900">{assets.length}</p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Largest</p>
          <p className="text-xl font-bold text-gray-900">
            {assets[0]?.asset || 'N/A'}
          </p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Largest %</p>
          <p className="text-xl font-bold text-gray-900">
            {formatPercentage((assets[0]?.percentage || 0) / 100, 1)}
          </p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Diversification</p>
          <p className="text-xl font-bold text-gray-900">
            {assets.filter((a) => a.percentage > 5).length}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AssetAllocationChart;