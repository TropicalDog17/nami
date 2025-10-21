import React from 'react';

interface CashFlowData {
  total_in_usd?: number;
  total_out_usd?: number;
  net_usd?: number;
  total_in_vnd?: number;
  total_out_vnd?: number;
  net_vnd?: number;
  operating_in_usd?: number;
  operating_out_usd?: number;
  operating_net_usd?: number;
  financing_in_usd?: number;
  financing_out_usd?: number;
  financing_net_usd?: number;
  by_type?: {
    [key: string]: {
      inflow_usd?: number;
      outflow_usd?: number;
      net_usd?: number;
      count?: number;
    };
  };
}

interface CashFlowChartProps {
  data: CashFlowData;
  currency: string;
}

const CashFlowChart: React.FC<CashFlowChartProps> = ({ data, currency }) => {
  const totalIn = currency === 'USD' ? (data.total_in_usd || 0) : (data.total_in_vnd || 0);
  const totalOut = currency === 'USD' ? (data.total_out_usd || 0) : (data.total_out_vnd || 0);
  const netFlow = currency === 'USD' ? (data.net_usd || 0) : (data.net_vnd || 0);

  const operatingIn = currency === 'USD' ? (data.operating_in_usd || 0) : (data.operating_in_vnd || 0);
  const operatingOut = currency === 'USD' ? (data.operating_out_usd || 0) : (data.operating_out_vnd || 0);
  const operatingNet = currency === 'USD' ? (data.operating_net_usd || 0) : (data.operating_net_vnd || 0);

  const financingIn = currency === 'USD' ? (data.financing_in_usd || 0) : (data.financing_in_vnd || 0);
  const financingOut = currency === 'USD' ? (data.financing_out_usd || 0) : (data.financing_out_vnd || 0);
  const financingNet = currency === 'USD' ? (data.financing_net_usd || 0) : (data.financing_net_vnd || 0);

  const formatCurrency = (amount: number) => {
    return currency === 'USD'
      ? `$${Math.abs(amount).toLocaleString()}`
      : `₫${Math.abs(amount).toLocaleString()}`;
  };

  const getNetColor = (amount: number) => {
    return amount >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const getNetBgColor = (amount: number) => {
    return amount >= 0 ? 'bg-green-50' : 'bg-red-50';
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h3 className="text-lg font-medium text-gray-900">Cash Flow Analysis</h3>
        <p className="text-sm text-gray-500">Overview of cash inflows and outflows</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <h4 className="text-sm font-medium text-green-800 mb-2">Total Inflow</h4>
          <p className="text-3xl font-bold text-green-900">
            {formatCurrency(totalIn)}
          </p>
        </div>

        <div className="bg-red-50 p-6 rounded-lg border border-red-200">
          <h4 className="text-sm font-medium text-red-800 mb-2">Total Outflow</h4>
          <p className="text-3xl font-bold text-red-900">
            {formatCurrency(totalOut)}
          </p>
        </div>

        <div className={`${getNetBgColor(netFlow)} p-6 rounded-lg border border-${netFlow >= 0 ? 'green' : 'red'}-200`}>
          <h4 className={`text-sm font-medium ${netFlow >= 0 ? 'text-green-800' : 'text-red-800'} mb-2`}>
            Net Cash Flow
          </h4>
          <p className={`text-3xl font-bold ${netFlow >= 0 ? 'text-green-900' : 'text-red-900'}`}>
            {netFlow >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netFlow))}
          </p>
        </div>
      </div>

      {/* Operating vs Financing */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h4 className="text-md font-medium text-gray-900 mb-4">Operating vs Financing Activities</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Operating */}
          <div className="space-y-4">
            <h5 className="font-medium text-gray-700">Operating Cash Flow</h5>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Inflow</span>
                <span className="font-medium text-green-600">{formatCurrency(operatingIn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Outflow</span>
                <span className="font-medium text-red-600">{formatCurrency(operatingOut)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span className="text-sm text-gray-900">Net Operating</span>
                <span className={getNetColor(operatingNet)}>
                  {operatingNet >= 0 ? '+' : '-'}{formatCurrency(Math.abs(operatingNet))}
                </span>
              </div>
            </div>
          </div>

          {/* Financing */}
          <div className="space-y-4">
            <h5 className="font-medium text-gray-700">Financing Cash Flow</h5>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Inflow (Borrow)</span>
                <span className="font-medium text-green-600">{formatCurrency(financingIn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Outflow (Repay)</span>
                <span className="font-medium text-red-600">{formatCurrency(financingOut)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span className="text-sm text-gray-900">Net Financing</span>
                <span className={getNetColor(financingNet)}>
                  {financingNet >= 0 ? '+' : '-'}{formatCurrency(Math.abs(financingNet))}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cash Flow Breakdown by Type */}
      {data.by_type && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="text-md font-medium text-gray-900 mb-4">Cash Flow by Transaction Type</h4>
          <div className="space-y-3">
            {Object.entries(data.by_type).map(([type, flowData]) => {
              const inflow = currency === 'USD' ? (flowData.inflow_usd || 0) : (flowData.inflow_vnd || 0);
              const outflow = currency === 'USD' ? (flowData.outflow_usd || 0) : (flowData.outflow_vnd || 0);
              const net = currency === 'USD' ? (flowData.net_usd || 0) : (flowData.net_vnd || 0);

              if (inflow === 0 && outflow === 0) return null;

              return (
                <div key={type} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <span className="font-medium text-gray-900 capitalize">{type.replace('_', ' ')}</span>
                    <span className="ml-2 text-sm text-gray-500">({flowData.count} transactions)</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    {inflow > 0 && (
                      <span className="text-green-600 font-medium">+{formatCurrency(inflow)}</span>
                    )}
                    {outflow > 0 && (
                      <span className="text-red-600 font-medium">-{formatCurrency(outflow)}</span>
                    )}
                    <span className={`font-medium ${getNetColor(net)}`}>
                      {net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(net))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CashFlowChart;