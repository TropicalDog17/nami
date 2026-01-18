import { useState, useEffect, useCallback } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    ResponsiveContainer,
} from 'recharts';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';

import { reportsApi } from '../../services/api';

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

const chartConfig = {
    aum: {
        label: 'AUM',
        color: 'hsl(217, 91%, 60%)',
    },
    pnl: {
        label: 'Cumulative P&L',
        color: 'hsl(142, 76%, 36%)',
    },
};

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
            const endDate =
                timeRange === 'custom'
                    ? customEnd
                    : now.toISOString().split('T')[0];
            let startDate: string;
            switch (timeRange) {
                case '7d':
                    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                        .toISOString()
                        .split('T')[0];
                    break;
                case '30d':
                    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                        .toISOString()
                        .split('T')[0];
                    break;
                case 'custom':
                    startDate = customStart;
                    break;
                default:
                    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                        .toISOString()
                        .split('T')[0];
            }

            const result = await reportsApi.series<{
                account: string;
                series: SeriesData[];
            }>({
                start: startDate,
                end: endDate,
            });

            if (result?.series) {
                setSeriesData(result.series);
            } else {
                setSeriesData([]);
            }
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Unknown error';
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
    const pnlKey = currency === 'USD' ? 'pnl_usd' : 'pnl_vnd';
    const aumKey = currency === 'USD' ? 'aum_usd' : 'aum_vnd';

    const chartData = seriesData.map((d) => {
        const date = new Date(d.date);
        return {
            date: date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
            }),
            aum: d[aumKey],
            pnl: d[pnlKey],
        };
    });

    // Calculate summary stats
    const totalAUM =
        seriesData.length > 0 ? seriesData[seriesData.length - 1][aumKey] : 0;
    const totalPnL =
        seriesData.length > 0 ? seriesData[seriesData.length - 1][pnlKey] : 0;
    const totalDeposits =
        seriesData.length > 0
            ? seriesData[seriesData.length - 1].deposits_cum_usd
            : 0;
    const totalWithdrawals =
        seriesData.length > 0
            ? seriesData[seriesData.length - 1].withdrawals_cum_usd
            : 0;
    const roi =
        seriesData.length > 0
            ? seriesData[seriesData.length - 1].roi_percent
            : 0;
    const apr =
        seriesData.length > 0
            ? seriesData[seriesData.length - 1].apr_percent
            : 0;

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <h3 className="text-lg font-medium">
                        Aggregated P&L Overview
                    </h3>

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
            </CardHeader>

            <CardContent>
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
                    <div
                        className={`p-3 rounded-lg ${totalPnL >= 0 ? 'bg-green-50' : 'bg-red-50'}`}
                    >
                        <p className="text-xs font-medium text-gray-800">
                            Total P&L
                        </p>
                        <p
                            className={`text-lg font-bold ${totalPnL >= 0 ? 'text-green-900' : 'text-red-900'}`}
                        >
                            {currency === 'USD'
                                ? `$${Math.abs(totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                                : `₫${Math.abs(totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        </p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg">
                        <p className="text-xs font-medium text-purple-800">
                            ROI
                        </p>
                        <p
                            className={`text-lg font-bold ${roi >= 0 ? 'text-green-900' : 'text-red-900'}`}
                        >
                            {roi.toFixed(1)}%
                        </p>
                    </div>
                    <div className="bg-orange-50 p-3 rounded-lg">
                        <p className="text-xs font-medium text-orange-800">
                            APR
                        </p>
                        <p className="text-lg font-bold text-orange-900">
                            {apr.toFixed(1)}%
                        </p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-xs font-medium text-gray-800">
                            Deposits
                        </p>
                        <p className="text-lg font-bold text-gray-900">
                            {currency === 'USD'
                                ? `$${totalDeposits.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                                : `₫${totalDeposits.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        </p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-xs font-medium text-gray-800">
                            Withdrawals
                        </p>
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
                        <ChartContainer config={chartConfig}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={chartData}
                                    margin={{
                                        top: 10,
                                        right: 60,
                                        left: 10,
                                        bottom: 0,
                                    }}
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
                                        className="text-sm"
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        className="text-sm"
                                        tickFormatter={(value) => {
                                            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                                            return value.toLocaleString();
                                        }}
                                    />
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        className="text-sm"
                                        tickFormatter={(value) => {
                                            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                                            return value.toLocaleString();
                                        }}
                                    />
                                    <ChartTooltip
                                        cursor={false}
                                        content={
                                            <ChartTooltipContent
                                                formatter={(value, name) => {
                                                    const label =
                                                        name === 'aum'
                                                            ? 'AUM'
                                                            : 'Cumulative P&L';
                                                    return `${label}: ${Number(value).toLocaleString()} ${currency}`;
                                                }}
                                            />
                                        }
                                    />
                                    <Line
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey="aum"
                                        stroke="var(--color-aum)"
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4 }}
                                    />
                                    <Line
                                        yAxisId="right"
                                        type="monotone"
                                        dataKey="pnl"
                                        stroke="var(--color-pnl)"
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default AggregatedPnLChart;
