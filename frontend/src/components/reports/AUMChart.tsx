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
    aum_vnd: number;
    pnl_usd: number;
    pnl_vnd: number;
    deposits_cum_usd?: number;
    withdrawals_cum_usd?: number;
    roi_percent?: number;
    apr_percent: number;
};

type SeriesSummary = {
    aum_usd: number;
    aum_vnd: number;
    pnl_usd: number;
    pnl_vnd: number;
    apr_percent: number;
    roi_percent: number;
    aum_change_usd: number;
    aum_change_vnd: number;
    aum_change_percent: number;
    pnl_change_usd: number;
    pnl_change_vnd: number;
    pnl_change_percent: number;
    apr_change_percent_points: number;
    roi_change_percent_points: number;
    apr_eligible?: boolean;
    days_elapsed?: number;
    range_return_percent?: number | null;
    range_days_elapsed?: number;
};

type AUMChartProps = {
    timeRange?: '7d' | '30d' | 'all';
    onTimeRangeChange?: (range: '7d' | '30d' | 'all') => void;
    vaults?: string[]; // Optional list of vault names/ids to aggregate
};

type TimeRange = '7d' | '30d' | 'all';

const chartConfig = {
    aum: {
        label: 'Portfolio Value',
        color: 'hsl(142, 76%, 36%)',
    },
};


export const AUMChart: React.FC<AUMChartProps> = ({
    timeRange: externalTimeRange,
    vaults,
}) => {
    const [internalTimeRange] = useState<TimeRange>('30d');
    const [seriesDataFull, setSeriesDataFull] = useState<SeriesData[]>([]);
    const [seriesSummary, setSeriesSummary] = useState<SeriesSummary | null>(
        null
    );
    const [rangeReturnPercent, setRangeReturnPercent] = useState<
        number | null
    >(null);
    const [rangeReturnLoading, setRangeReturnLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { currency } = useApp();

    const timeRange = externalTimeRange ?? internalTimeRange;

    const getRangeDates = useCallback((range: TimeRange) => {
        const now = new Date();
        const end = now.toISOString().split('T')[0];
        let start = '';

        switch (range) {
            case '7d':
                start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split('T')[0];
                break;
            case '30d':
                start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split('T')[0];
                break;
            case 'all':
            default:
                start = '';
                break;
        }

        return { start, end };
    }, []);

    // Filter data to show only from max(first data date, T-7d/T-30d)
    const filterDataByTimeRange = useCallback(
        (data: SeriesData[]): SeriesData[] => {
            if (data.length === 0) return data;

            // Calculate date range inline
            const now = new Date();
            let startDate: string;
            switch (timeRange) {
                case '7d':
                    startDate = new Date(
                        now.getTime() - 7 * 24 * 60 * 60 * 1000
                    )
                        .toISOString()
                        .split('T')[0];
                    break;
                case '30d':
                    startDate = new Date(
                        now.getTime() - 30 * 24 * 60 * 60 * 1000
                    )
                        .toISOString()
                        .split('T')[0];
                    break;
                case 'all':
                    startDate = '';
                    break;
                default:
                    startDate = new Date(
                        now.getTime() - 30 * 24 * 60 * 60 * 1000
                    )
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
            const effectiveStartDate =
                firstDataDate > start ? firstDataDate : start;

            return data.filter((d) => d.date >= effectiveStartDate);
        },
        [timeRange]
    );

    // Computed filtered data
    const seriesData: SeriesData[] = useMemo(
        () => filterDataByTimeRange(seriesDataFull),
        [seriesDataFull, filterDataByTimeRange]
    );

    const vaultsParam = useMemo(() => {
        if (!Array.isArray(vaults) || vaults.length === 0) return '';
        return vaults.join(',');
    }, [vaults]);

    // Fetch AUM series data (fetch all data, filter on frontend)
    const fetchData = async () => {
        // If a vault filter is provided but empty, don't fall back to "all vaults".
        if (Array.isArray(vaults) && vaults.length === 0) {
            setLoading(false);
            setError(null);
            setSeriesDataFull([]);
            setSeriesSummary(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Always fetch all data (no start date)
            const params: Record<string, string> = {
                end: new Date().toISOString().split('T')[0],
            };
            if (vaultsParam) params.vaults = vaultsParam;

            const result = await reportsApi.series<{
                account: string;
                series: SeriesData[];
                summary?: SeriesSummary | null;
            }>(params);

            if (result?.series) {
                const sorted = [...result.series].sort((a, b) =>
                    a.date.localeCompare(b.date)
                );
                setSeriesDataFull(sorted);
                setSeriesSummary(result.summary ?? null);
            } else {
                setSeriesDataFull([]);
                setSeriesSummary(null);
            }
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Unknown error';
            setError(`Failed to load AUM data: ${message}`);
            setSeriesDataFull([]);
            setSeriesSummary(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchData();
    }, [timeRange, vaultsParam]);

    useEffect(() => {
        const loadRangeReturn = async () => {
            if (Array.isArray(vaults) && vaults.length === 0) {
                setRangeReturnPercent(null);
                return;
            }

            try {
                setRangeReturnLoading(true);
                const { start, end } = getRangeDates(timeRange);
                const params: Record<string, string> = { end };
                if (start) params.start = start;
                if (vaultsParam) params.vaults = vaultsParam;

                const result = await reportsApi.series<{
                    summary?: { range_return_percent?: number | null };
                }>(params);
                setRangeReturnPercent(
                    result?.summary?.range_return_percent ?? null
                );
            } catch {
                setRangeReturnPercent(null);
            } finally {
                setRangeReturnLoading(false);
            }
        };

        void loadRangeReturn();
    }, [timeRange, vaults, vaultsParam, getRangeDates]);

    // Calculate daily changes and current values
    const metrics = useMemo(() => {
        if (seriesSummary) {
            return {
                currentAUM:
                    currency === 'VND'
                        ? seriesSummary.aum_vnd
                        : seriesSummary.aum_usd,
                aumDailyChange:
                    currency === 'VND'
                        ? seriesSummary.aum_change_vnd
                        : seriesSummary.aum_change_usd,
                aumDailyChangePercent: seriesSummary.aum_change_percent,
                currentPnL:
                    currency === 'VND'
                        ? seriesSummary.pnl_vnd
                        : seriesSummary.pnl_usd,
                pnlDailyChange:
                    currency === 'VND'
                        ? seriesSummary.pnl_change_vnd
                        : seriesSummary.pnl_change_usd,
                pnlDailyChangePercent: seriesSummary.pnl_change_percent,
                currentAPR: seriesSummary.apr_percent,
                aprDailyChange: seriesSummary.apr_change_percent_points,
                aprDailyChangePercent: 0,
                currentROI: seriesSummary.roi_percent,
                roiDailyChange: seriesSummary.roi_change_percent_points,
                aprEligible: seriesSummary.apr_eligible ?? true,
            };
        }

        if (seriesDataFull.length === 0) {
            return {
                currentAUM: 0,
                aumDailyChange: 0,
                aumDailyChangePercent: 0,
                currentPnL: 0,
                pnlDailyChange: 0,
                pnlDailyChangePercent: 0,
                currentAPR: 0,
                aprDailyChange: 0,
                aprDailyChangePercent: 0,
                currentROI: 0,
                roiDailyChange: 0,
                aprEligible: false,
            };
        }

        const latest = seriesDataFull[seriesDataFull.length - 1];
        const latestAum = currency === 'VND' ? latest.aum_vnd : latest.aum_usd;
        const latestPnL = currency === 'VND' ? latest.pnl_vnd : latest.pnl_usd;

        return {
            currentAUM: latestAum,
            aumDailyChange: 0,
            aumDailyChangePercent: 0,
            currentPnL: latestPnL,
            pnlDailyChange: 0,
            pnlDailyChangePercent: 0,
            currentAPR: 0,
            aprDailyChange: 0,
            aprDailyChangePercent: 0,
            currentROI: 0,
            roiDailyChange: 0,
            aprEligible: false,
        };
    }, [currency, seriesDataFull, seriesSummary]);

    // Transform data for Recharts
    const chartData = useMemo(() => {
        return seriesData.map((d) => {
            const date = new Date(d.date);
            return {
                date: date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                }),
                aum: currency === 'VND' ? d.aum_vnd : d.aum_usd,
            };
        });
    }, [currency, seriesData]);

    // Calculate Y-axis domain to start at a reasonable minimum
    const yAxisDomain = useMemo(() => {
        if (seriesData.length === 0) return [0, 100000] as [number, number];

        const values = seriesData.map((d) =>
            currency === 'VND' ? d.aum_vnd : d.aum_usd
        );
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);

        // Add 5% padding above the ATH value for better visual spacing
        const padding = maxValue * 0.05;
        const domainMax = maxValue + padding;

        // Round down min value, but ensure we include zero if it makes sense
        // If min is less than 20% of the range, start from zero
        const range = maxValue - minValue;
        const domainMin = minValue < range * 0.2 ? 0 : minValue;

        return [domainMin, domainMax] as [number, number];
    }, [currency, seriesData]);

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

    const formatPercentagePoints = (value: number) => {
        return `${value >= 0 ? '+' : ''}${value.toFixed(2)}pp`;
    };

    const renderMetricCard = (
        title: string,
        value: number | null,
        dailyChange: number,
        dailyChangePercent: number,
        isPercentValue: boolean = false,
        showChangePercent: boolean = true,
        showChange: boolean = true,
        titleHint?: string
    ) => {
        const showValue = typeof value === 'number' && isFinite(value);
        const isPositive = dailyChange > 0;
        const isNegative = dailyChange < 0;
        const changeColor = isPositive
            ? 'text-green-600'
            : isNegative
              ? 'text-red-600'
              : 'text-gray-600';

        return (
            <Card>
                <CardContent className="p-4">
                    <h3
                        className="text-sm font-medium text-gray-500 mb-2"
                        title={titleHint}
                    >
                        {title}
                    </h3>
                    <p className="text-2xl font-bold text-gray-900">
                        {showValue
                            ? isPercentValue
                                ? `${value.toFixed(2)}%`
                                : formatCurrency(value)
                            : '—'}
                    </p>
                    {showChange && showValue && (
                        <div
                            className={`flex items-center text-sm mt-1 ${changeColor}`}
                        >
                            {isPositive ? (
                                <span className="mr-1">▲</span>
                            ) : isNegative ? (
                                <span className="mr-1">▼</span>
                            ) : (
                                <span className="mr-1">—</span>
                            )}
                            <span>
                                {showChangePercent
                                    ? `${formatPercentage(
                                          dailyChangePercent
                                      )} (${
                                          isPercentValue
                                              ? formatPercentagePoints(
                                                    dailyChange
                                                )
                                              : formatCurrency(
                                                    Math.abs(dailyChange)
                                                )}
                                      )`
                                    : isPercentValue
                                      ? formatPercentagePoints(dailyChange)
                                      : formatCurrency(Math.abs(dailyChange))}
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    return (
        <>
            {/* Metrics Cards */}
            <div className="col-span-1 lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {loading ? (
                    <div className="col-span-5 flex items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : error ? (
                    <div className="col-span-5 flex items-center justify-center h-32 text-red-500 text-sm">
                        {error}
                    </div>
                ) : seriesData.length === 0 ? (
                    <div className="col-span-5 flex items-center justify-center h-32 text-gray-500 text-sm">
                        No data available
                    </div>
                ) : (
                    <>
                        {renderMetricCard(
                            'Total AUM',
                            metrics.currentAUM,
                            metrics.aumDailyChange,
                            metrics.aumDailyChangePercent
                        )}
                        {renderMetricCard(
                            'Total PnL',
                            metrics.currentPnL,
                            metrics.pnlDailyChange,
                            metrics.pnlDailyChangePercent
                        )}
                        {renderMetricCard(
                            'ROI (Since Inception)',
                            metrics.currentROI,
                            metrics.roiDailyChange,
                            0,
                            true,
                            false,
                            true,
                            'Total return since inception (not annualized)'
                        )}
                        {renderMetricCard(
                            'APR (Annualized)',
                            metrics.aprEligible ? metrics.currentAPR : null,
                            metrics.aprDailyChange,
                            metrics.aprDailyChangePercent,
                            true,
                            false,
                            metrics.aprEligible,
                            'Annualized IRR since inception (shown after 30 days)'
                        )}
                        {renderMetricCard(
                            `Return (${timeRange.toUpperCase()})`,
                            rangeReturnLoading ? null : rangeReturnPercent,
                            0,
                            0,
                            true,
                            false,
                            false,
                            'Money-weighted return over the selected range'
                        )}
                    </>
                )}
            </div>

            {/* Portfolio Value Chart */}
            <Card className="col-span-1 lg:col-span-1">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                        Portfolio Value
                    </CardTitle>
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
                            <ChartContainer
                                config={chartConfig}
                                className="h-full w-full"
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={chartData}
                                        margin={{
                                            top: 10,
                                            right: 10,
                                            left: 0,
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
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            className="text-sm"
                                            width={100}
                                            tickFormatter={(value) =>
                                                formatCurrency(Number(value))
                                            }
                                            domain={yAxisDomain}
                                        />
                                        <ChartTooltip
                                            cursor={false}
                                            content={
                                                <ChartTooltipContent
                                                    formatter={(value) => {
                                                        return formatCurrency(
                                                            Number(value)
                                                        );
                                                    }}
                                                />
                                            }
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="aum"
                                            stroke="var(--color-aum)"
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
