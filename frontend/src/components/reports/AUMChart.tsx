import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { useApp } from '@/context/AppContext';

import { reportsApi } from '../../services/api';

type SeriesData = {
  date: string;
  aum_usd: number;
  pnl_usd: number;
  apr_percent: number;
};

type AUMChartProps = {
  timeRange?: '7d' | '30d' | 'all';
  onTimeRangeChange?: (range: '7d' | '30d' | 'all') => void;
};

type TimeRange = '7d' | '30d' | 'all';

const chartConfig = {
  aum_usd: {
    label: 'Portfolio Value',
    color: 'hsl(142, 76%, 36%)',
  },
};

export const AUMChart: React.FC<AUMChartProps> = ({
  timeRange: externalTimeRange,
}) => {
  const [internalTimeRange] = useState<TimeRange>('30d');
  const [seriesDataFull, setSeriesDataFull] = useState<SeriesData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currency } = useApp();

  const timeRange = externalTimeRange ?? internalTimeRange;

  // Filter data to show only from max(first data date, T-7d/T-30d)
  const filterDataByTimeRange = useCallback(
    (data: SeriesData[]): SeriesData[] => {
      if (data.length === 0) return data;

      // Calculate date range inline
      const now = new Date();
      let startDate: string;
      switch (timeRange) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          break;
        case 'all':
          startDate = '';
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
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
        return data.filter((d) => d.date >= firstDataDate);
      }

      // Use whichever is later: first data date OR T-7d/T-30d
      const effectiveStartDate = firstDataDate > start ? firstDataDate : start;

      return data.filter((d) => d.date >= effectiveStartDate);
    },
    [timeRange]
  );

  // Computed filtered data
  const seriesData: SeriesData[] = useMemo(
    () => filterDataByTimeRange(seriesDataFull),
    [seriesDataFull, filterDataByTimeRange]
  );

  // Fetch AUM series data (fetch all data, filter on frontend)
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Always fetch all data (no start date)
      const params: Record<string, string> = {
        end: new Date().toISOString().split('T')[0],
      };

      const result = await reportsApi.series<{
        account: string;
        series: Array<{
          date: string;
          aum_usd: number;
          pnl_usd: number;
          apr_percent: number;
        }>;
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

  // Calculate daily changes and current values
  const metrics = useMemo(() => {
    if (seriesData.length < 2) {
      return {
        currentAUM: seriesData[0]?.aum_usd || 0,
        aumDailyChange: 0,
        aumDailyChangePercent: 0,
        currentPnL: seriesData[0]?.pnl_usd || 0,
        pnlDailyChange: 0,
        pnlDailyChangePercent: 0,
        currentAPR: seriesData[0]?.apr_percent || 0,
        aprDailyChange: 0,
        aprDailyChangePercent: 0,
      };
    }

    const latest = seriesData[seriesData.length - 1];
    const previous = seriesData[seriesData.length - 2];

    const aumChange = latest.aum_usd - previous.aum_usd;
    const aumChangePercent = previous.aum_usd !== 0 ? (aumChange / previous.aum_usd) * 100 : 0;

    const pnlChange = latest.pnl_usd - previous.pnl_usd;
    const pnlChangePercent = previous.pnl_usd !== 0 ? (pnlChange / Math.abs(previous.pnl_usd)) * 100 : 0;

    const aprChange = latest.apr_percent - previous.apr_percent;
    const aprChangePercent = previous.apr_percent !== 0 ? (aprChange / Math.abs(previous.apr_percent)) * 100 : 0;

    return {
      currentAUM: latest.aum_usd,
      aumDailyChange: aumChange,
      aumDailyChangePercent: aumChangePercent,
      currentPnL: latest.pnl_usd,
      pnlDailyChange: pnlChange,
      pnlDailyChangePercent: pnlChangePercent,
      currentAPR: latest.apr_percent,
      aprDailyChange: aprChange,
      aprDailyChangePercent: aprChangePercent,
    };
  }, [seriesData]);

  // Transform data for Recharts
  const chartData = useMemo(() => {
    return seriesData.map((d) => {
      const date = new Date(d.date);
      return {
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        aum_usd: d.aum_usd,
      };
    });
  }, [seriesData]);

  // Calculate Y-axis domain to start at a reasonable minimum
  const yAxisDomain = useMemo(() => {
    if (seriesData.length === 0) return [0, 100000] as [number, number];

    const values = seriesData.map(d => d.aum_usd);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    // Calculate nice rounded bounds that include zero
    // Find the order of magnitude
    const maxMagnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
    const minMagnitude = Math.pow(10, Math.floor(Math.log10(minValue)));

    // Round up max value to next nice number
    const domainMax = Math.ceil(maxValue / maxMagnitude) * maxMagnitude;

    // Round down min value, but ensure we include zero if it makes sense
    // If min is less than 20% of the range, start from zero
    const range = maxValue - minValue;
    const domainMin = (minValue < range * 0.2) ? 0 : Math.floor(minValue / minMagnitude) * minMagnitude;

    return [domainMin, domainMax] as [number, number];
  }, [seriesData]);

  const formatCurrency = (value: number) => {
    // For VND, round to 1 decimal place; for USD, use 2 decimal places
    const decimalDigits = currency === 'VND' ? 1 : 2;

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: decimalDigits,
      maximumFractionDigits: decimalDigits,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const renderMetricCard = (
    title: string,
    value: number,
    dailyChange: number,
    dailyChangePercent: number,
    isPercentValue: boolean = false
  ) => {
    const isPositive = dailyChange > 0;
    const isNegative = dailyChange < 0;
    const changeColor = isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-600';

    return (
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
          <p className="text-2xl font-bold text-gray-900">
            {isPercentValue ? `${value.toFixed(2)}%` : formatCurrency(value)}
          </p>
          <div className={`flex items-center text-sm mt-1 ${changeColor}`}>
            {isPositive ? (
              <span className="mr-1">▲</span>
            ) : isNegative ? (
              <span className="mr-1">▼</span>
            ) : (
              <span className="mr-1">—</span>
            )}
            <span>
              {formatPercentage(dailyChangePercent)} ({isPercentValue ? `${dailyChange >= 0 ? '+' : ''}${dailyChange.toFixed(2)}%` : formatCurrency(Math.abs(dailyChange))})
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      {/* Metrics Cards */}
      <div className="col-span-1 lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="col-span-3 flex items-center justify-center h-32 text-red-500 text-sm">
            {error}
          </div>
        ) : seriesData.length === 0 ? (
          <div className="col-span-3 flex items-center justify-center h-32 text-gray-500 text-sm">
            No data available
          </div>
        ) : (
          <>
            {renderMetricCard('Total AUM', metrics.currentAUM, metrics.aumDailyChange, metrics.aumDailyChangePercent)}
            {renderMetricCard('Total PnL', metrics.currentPnL, metrics.pnlDailyChange, metrics.pnlDailyChangePercent)}
            {renderMetricCard('APR', metrics.currentAPR, metrics.aprDailyChange, metrics.aprDailyChangePercent, true)}
          </>
        )}
      </div>

      {/* Portfolio Value Chart */}
      <Card className="col-span-1 lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
        </CardHeader>
        <CardContent>
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
              <ChartContainer config={chartConfig} className="h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      className="text-xs"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      className="text-xs"
                      tickFormatter={(value) => {
                        const decimals = currency === 'VND' ? 1 : 1;
                        const symbol = currency === 'VND' ? '₫' : '$';
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                        return `${symbol}${value.toFixed(decimals)}`;
                      }}
                      domain={yAxisDomain}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          formatter={(value) => {
                            const decimals = currency === 'VND' ? 1 : 1;
                            const symbol = currency === 'VND' ? '₫' : '$';
                            return `${symbol}${Number(value).toFixed(decimals)}`;
                          }
                        }
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="aum_usd"
                      stroke="var(--color-aum_usd)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default AUMChart;
