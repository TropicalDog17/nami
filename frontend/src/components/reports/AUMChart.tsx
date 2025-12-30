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
import { useState, useEffect, useMemo } from 'react';
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

type SeriesData = {
  date: string;
  aum_usd: number;
};

type AUMChartProps = {
  timeRange?: '7d' | '30d' | 'all';
  onTimeRangeChange?: (range: '7d' | '30d' | 'all') => void;
};

type TimeRange = '7d' | '30d' | 'all';

export const AUMChart: React.FC<AUMChartProps> = ({
  timeRange: externalTimeRange,
  onTimeRangeChange,
}) => {
  const [internalTimeRange, _setInternalTimeRange] = useState<TimeRange>('30d');
  const [seriesDataFull, setSeriesDataFull] = useState<SeriesData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeRange = externalTimeRange ?? internalTimeRange;

  // _setInternalTimeRange is unused because we always use the prop if provided
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setTimeRange = (range: TimeRange) => {
    if (onTimeRangeChange) {
      onTimeRangeChange(range);
    } else {
      _setInternalTimeRange(range);
    }
  };

  // Filter data to show only from max(first data date, T-7d/T-30d)
  const filterDataByTimeRange = useCallback((data: SeriesData[]): SeriesData[] => {
    if (data.length === 0) return data;

    // Calculate date range inline
    const now = new Date();
    let startDate: string;
    switch (timeRange) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'all':
        startDate = '';
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }
    const start = startDate;

    // Find the first date with actual AUM data (> 0)
    let firstDataDate: string | undefined;
    for (const d of data) {
      if (d.aum_usd > 0) {
        firstDataDate = d.date;
        break;
      }
    }

    // If no AUM data found, return empty
    if (!firstDataDate) return [];

    // If 'all', show all data starting from first AUM date
    if (timeRange === 'all' || !start) {
      return data.filter(d => d.date >= firstDataDate);
    }

    // Use whichever is later: first data date OR T-7d/T-30d
    const effectiveStartDate = firstDataDate > start ? firstDataDate : start;

    return data.filter(d => d.date >= effectiveStartDate);
  }, [timeRange]);

  // Computed filtered data
  const seriesData: SeriesData[] = useMemo(() => filterDataByTimeRange(seriesDataFull), [seriesDataFull, filterDataByTimeRange]);

  // Fetch AUM series data (fetch all data, filter on frontend)
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Always fetch all data (no start date)
      const params: Record<string, string> = {
        end: new Date().toISOString().split('T')[0]
      };

      const result = await reportsApi.series<{
        account: string;
        series: SeriesData[];
      }>(params);

      if (result?.series) {
        setSeriesDataFull(result.series);
      } else {
        setSeriesDataFull([]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load AUM data: ${message}`);
      setSeriesDataFull([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [timeRange]);

  // Prepare chart data
  const labels = seriesData.map((d): string => {
    if (typeof d.date !== 'string' || !d.date) return '';
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const aumUsdData = seriesData.map((d): number => d.aum_usd);

  // Create gradient for portfolio-like look
  const createGradient = (ctx: CanvasRenderingContext2D, chartArea: { bottom: number; top: number; left: number; right: number }) => {
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
    gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.1)');
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0.02)');
    return gradient;
  };

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Portfolio Value',
        data: aumUsdData,
        borderColor: '#22c55e',
        backgroundColor: function (context: { chart: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; chartArea?: { bottom: number; top: number; left: number; right: number } } }) {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) {
            return 'rgba(34, 197, 94, 0.1)';
          }
          return createGradient(ctx, chartArea);
        },
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#22c55e',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
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
          label: function (context: {
            dataset: { label?: string };
            parsed: { y: number };
          }) {
            const label = context.dataset.label ?? '';
            const value = context.parsed.y;
            return `${label}: $${value.toLocaleString()}`;
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
          text: 'Portfolio Value (USD)',
          font: {
            size: 12,
            weight: 'normal' as const,
          },
        },
        ticks: {
          callback: function (value: number) {
            return '$' + value.toLocaleString();
          },
        },
      },
    },
  };

  // Calculate summary stats
  const _totalAUMUSD =
    aumUsdData.length > 0 ? aumUsdData[aumUsdData.length - 1] : 0;

  return (
    <div>
      {/* Header */}
      <h3 className="text-sm font-medium text-gray-900 mb-3">Portfolio Value</h3>

      {/* Chart */}
      <div style={{ height: 280 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500 text-sm">
            {error}
          </div>
        ) : seriesData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No AUM data available
          </div>
        ) : (
          <Line data={chartData} options={options} />
        )}
      </div>
    </div>
  );
};

export default AUMChart;
