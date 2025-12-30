import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';

import { reportsApi } from '../../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type Currency = 'USD' | 'VND';

type SeriesData = {
  date: string;
  aum_usd: number;
  aum_vnd: number;
  deposits_cum_usd: number;
  withdrawals_cum_usd: number;
  pnl_usd: number;
  pnl_vnd: number;
  roi_percent: number;
  apr_percent: number;
};

type AggregatedPnLChartProps = {
  currency?: Currency;
  onCurrencyChange?: (currency: Currency) => void;
};

type TimeRange = '7d' | '30d' | 'custom';

export const AggregatedPnLChart: React.FC<AggregatedPnLChartProps> = ({
  currency = 'USD',
  onCurrencyChange,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [seriesData, setSeriesData] = useState<SeriesData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch aggregated PnL series data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Calculate date range inline
      const now = new Date();
      const endDate = timeRange === 'custom' ? customEnd : now.toISOString().split('T')[0];
      let startDate: string;
      switch (timeRange) {
        case '7d':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        case '30d':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        case 'custom':
          startDate = customStart;
          break;
        case 'all':
          startDate = '';
          break;
        default:
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      }

      const result = await reportsApi.series<{ account: string; series: SeriesData[] }>({
        start: startDate,
        end: endDate,
      });

      if (result?.series) {
        setSeriesData(result.series);
      } else {
        setSeriesData([]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load PnL data: ${message}`);
      setSeriesData([]);
    } finally {
      setLoading(false);
    }
  }, [timeRange, customStart, customEnd]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Prepare chart data
  const labels = seriesData.map((d) => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const pnlKey = currency === 'USD' ? 'pnl_usd' : 'pnl_vnd';
  const aumKey = currency === 'USD' ? 'aum_usd' : 'aum_vnd';

  const pnlData = seriesData.map((d) => d[pnlKey]);
  const aumData = seriesData.map((d) => d[aumKey]);

  // Calculate cumulative PnL from start
  const cumulativePnLData: number[] = [];
  let cumulativePnL = 0;
  for (let i = 0; i < pnlData.length; i++) {
    if (i === 0) {
      cumulativePnL = pnlData[i];
    } else {
      cumulativePnL += pnlData[i] - pnlData[i - 1];
    }
    cumulativePnLData.push(cumulativePnL);
  }

  const chartData = {
    labels,
    datasets: [
      {
        label: `AUM (${currency})`,
        data: aumData,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4,
        yAxisID: 'y',
      },
      {
        label: `Cumulative P&L (${currency})`,
        data: cumulativePnLData,
        borderColor: cumulativePnLData[cumulativePnLData.length - 1] >= 0 ? '#10B981' : '#EF4444',
        backgroundColor: cumulativePnLData[cumulativePnLData.length - 1] >= 0
          ? 'rgba(16, 185, 129, 0.1)'
          : 'rgba(239, 68, 68, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4,
        yAxisID: 'y1',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          padding: 15,
          font: {
            size: 12,
          },
        },
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: { dataset: { label?: string }; parsed: { y: number } }) {
            const label = context.dataset.label ?? '';
            const value = context.parsed.y;
            return `${label}: ${value.toLocaleString()} ${currency}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10,
        },
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: `AUM (${currency})`,
        },
        ticks: {
          callback: function (value: number) {
            return value.toLocaleString();
          },
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: `Cumulative P&L (${currency})`,
        },
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          callback: function (value: number) {
            return value.toLocaleString();
          },
        },
      },
    },
  };

  // Calculate summary stats
  const totalAUM = aumData.length > 0 ? aumData[aumData.length - 1] : 0;
  const totalPnL = cumulativePnLData.length > 0 ? cumulativePnLData[cumulativePnLData.length - 1] : 0;
  const totalDeposits = seriesData.length > 0 ? seriesData[seriesData.length - 1].deposits_cum_usd : 0;
  const totalWithdrawals = seriesData.length > 0 ? seriesData[seriesData.length - 1].withdrawals_cum_usd : 0;
  const roi = seriesData.length > 0 ? seriesData[seriesData.length - 1].roi_percent : 0;
  const apr = seriesData.length > 0 ? seriesData[seriesData.length - 1].apr_percent : 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header with Time Range Selector and Currency Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h3 className="text-lg font-medium text-gray-900">Aggregated P&L Overview</h3>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Time Range Selector */}
          <div className="flex rounded-md shadow-sm" role="group">
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-2 text-sm font-medium border rounded-l-lg ${
                timeRange === '7d'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              7D
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-3 py-2 text-sm font-medium border-t border-b border-r ${
                timeRange === '30d'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              30D
            </button>
            <button
              onClick={() => setTimeRange('custom')}
              className={`px-3 py-2 text-sm font-medium border-t border-b border-r rounded-r-lg ${
                timeRange === 'custom'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Custom
            </button>
          </div>

          {/* Currency Toggle */}
          <div className="flex rounded-md shadow-sm" role="group">
            <button
              onClick={() => onCurrencyChange?.('USD')}
              className={`px-3 py-2 text-sm font-medium border rounded-l-lg ${
                currency === 'USD'
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              USD
            </button>
            <button
              onClick={() => onCurrencyChange?.('VND')}
              className={`px-3 py-2 text-sm font-medium border-t border-b border-r rounded-r-lg ${
                currency === 'VND'
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              VND
            </button>
          </div>
        </div>
      </div>

      {/* Custom Date Range Inputs */}
      {timeRange === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-blue-50 p-3 rounded-lg">
          <p className="text-xs font-medium text-blue-800">AUM</p>
          <p className="text-lg font-bold text-blue-900">
            {currency === 'USD'
              ? `$${totalAUM.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : `₫${totalAUM.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          </p>
        </div>
        <div className={`p-3 rounded-lg ${totalPnL >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className="text-xs font-medium text-gray-800">Total P&L</p>
          <p className={`text-lg font-bold ${totalPnL >= 0 ? 'text-green-900' : 'text-red-900'}`}>
            {currency === 'USD'
              ? `$${Math.abs(totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : `₫${Math.abs(totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          </p>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg">
          <p className="text-xs font-medium text-purple-800">ROI</p>
          <p className={`text-lg font-bold ${roi >= 0 ? 'text-green-900' : 'text-red-900'}`}>
            {roi.toFixed(1)}%
          </p>
        </div>
        <div className="bg-orange-50 p-3 rounded-lg">
          <p className="text-xs font-medium text-orange-800">APR</p>
          <p className="text-lg font-bold text-orange-900">
            {apr.toFixed(1)}%
          </p>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-xs font-medium text-gray-800">Deposits</p>
          <p className="text-lg font-bold text-gray-900">
            {currency === 'USD'
              ? `$${totalDeposits.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : `₫${totalDeposits.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          </p>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-xs font-medium text-gray-800">Withdrawals</p>
          <p className="text-lg font-bold text-gray-900">
            {currency === 'USD'
              ? `$${totalWithdrawals.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : `₫${totalWithdrawals.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          </p>
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="flex items-center justify-center h-80">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-center">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      ) : seriesData.length === 0 ? (
        <div className="flex items-center justify-center h-80 text-gray-500">
          <p>No P&L data available for the selected period</p>
        </div>
      ) : (
        <div style={{ height: '350px' }}>
          <Line data={chartData} options={options} />
        </div>
      )}
    </div>
  );
};

export default AggregatedPnLChart;
