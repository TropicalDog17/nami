import React from 'react';

interface AssetData {
  [key: string]: {
    quantity: number;
    value_usd?: number;
    value_vnd?: number;
    percentage: number;
  };
}

interface AssetAllocationChartProps {
  data: { by_asset: AssetData; total_value_usd?: number; total_value_vnd?: number };
  currency: string;
}

const AssetAllocationChart: React.FC<AssetAllocationChartProps> = ({ data, currency }) => {
  const assets = Object.entries(data.by_asset || {})
    .map(([asset, info]) => ({
      asset,
      value: currency === 'USD' ? (info.value_usd || 0) : (info.value_vnd || 0),
      percentage: info.percentage,
      quantity: info.quantity
    }))
    .sort((a, b) => b.value - a.value);

  const totalValue = currency === 'USD'
    ? (data.total_value_usd || 0)
    : (data.total_value_vnd || 0);

  const getAllocationColor = (percentage: number) => {
    if (percentage > 50) return 'bg-blue-500';
    if (percentage > 25) return 'bg-green-500';
    if (percentage > 10) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h3 className="text-lg font-medium text-gray-900">Asset Allocation</h3>
        <p className="text-sm text-gray-500">Portfolio diversification by asset</p>
      </div>

      {/* Total Portfolio Value */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200">
        <div className="text-center">
          <p className="text-sm font-medium text-blue-800 mb-2">Total Portfolio Value</p>
          <p className="text-4xl font-bold text-blue-900">
            {currency === 'USD'
              ? `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `₫${totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
            }
          </p>
        </div>
      </div>

      {/* Horizontal Bar Chart */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h4 className="text-md font-medium text-gray-900 mb-4">Allocation Breakdown</h4>
        <div className="space-y-3">
          {assets.map((asset, index) => (
            <div key={asset.asset} className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-3 h-3 rounded-full ${getAllocationColor(asset.percentage)}`}
                  />
                  <span className="font-medium text-gray-900">{asset.asset}</span>
                  <span className="text-sm text-gray-500">
                    {asset.quantity.toLocaleString()}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-medium text-gray-900">
                    {currency === 'USD'
                      ? `$${asset.value.toLocaleString()}`
                      : `₫${asset.value.toLocaleString()}`
                    }
                  </span>
                  <span className="ml-2 text-sm text-gray-500">
                    ({asset.percentage.toFixed(1)}%)
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${getAllocationColor(asset.percentage)}`}
                  style={{ width: `${asset.percentage}%` }}
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
          <p className="text-xl font-bold text-gray-900">{assets[0]?.asset || 'N/A'}</p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Largest %</p>
          <p className="text-xl font-bold text-gray-900">
            {assets[0]?.percentage.toFixed(1) || 0}%
          </p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Diversification</p>
          <p className="text-xl font-bold text-gray-900">
            {assets.filter(a => a.percentage > 5).length} assets >5%
          </p>
        </div>
      </div>
    </div>
  );
};

export default AssetAllocationChart;