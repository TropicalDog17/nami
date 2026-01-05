import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    Legend,
    Tooltip,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';

type Currency = 'USD' | 'VND';

// Chart colors palette
const CHART_COLORS = [
    '#FF6384',
    '#36A2EB',
    '#FFCE56',
    '#4BC0C0',
    '#9966FF',
    '#FF9F40',
    '#FF6384',
    '#C9CBCF',
    '#4BC0C0',
    '#36A2EB',
];

type HoldingsData = {
    by_asset?: Record<
        string,
        { value_usd?: number | string; value_vnd?: number | string }
    >;
};

// Holdings Pie Chart
export const HoldingsChart: React.FC<{
    data: HoldingsData;
    currency?: Currency;
}> = ({ data, currency = 'USD' }) => {
    if (!data?.by_asset) return null;

    const assets = Object.entries(data.by_asset);
    const chartData = assets.map(([asset, holding], index) => ({
        name: asset,
        value: Math.abs(
            parseFloat(
                String(
                    currency === 'USD'
                        ? (holding.value_usd ?? 0)
                        : (holding.value_vnd ?? 0)
                )
            )
        ),
        fill: CHART_COLORS[index % CHART_COLORS.length],
    }));

    const total = chartData.reduce((sum, item) => sum + item.value, 0);

    const chartConfig = chartData.reduce(
        (acc, item) => {
            acc[item.name] = { label: item.name, color: item.fill };
            return acc;
        },
        {} as Record<string, { label: string; color: string }>
    );

    return (
        <ChartContainer config={chartConfig} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius="40%"
                        outerRadius="70%"
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Pie>
                    <Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0];
                            const value = item.value as number;
                            const percentage = ((value / total) * 100).toFixed(
                                1
                            );
                            return (
                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="font-medium">
                                        {item.name}
                                    </div>
                                    <div className="text-muted-foreground">
                                        {value.toLocaleString()} {currency} (
                                        {percentage}%)
                                    </div>
                                </div>
                            );
                        }}
                    />
                    <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => (
                            <span className="text-xs">{value}</span>
                        )}
                    />
                </PieChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};

type CashFlowByType = Record<
    string,
    {
        inflow_usd?: number | string;
        inflow_vnd?: number | string;
        outflow_usd?: number | string;
        outflow_vnd?: number | string;
    }
>;

// Cash Flow Bar Chart
export const CashFlowChart: React.FC<{
    data: { by_type?: CashFlowByType };
    currency?: Currency;
}> = ({ data, currency = 'USD' }) => {
    if (!data?.by_type) return null;

    const types = Object.entries(data.by_type);
    const chartData = types.map(([type, flow]) => ({
        name: type,
        inflows: parseFloat(
            String(
                currency === 'USD'
                    ? (flow.inflow_usd ?? 0)
                    : (flow.inflow_vnd ?? 0)
            )
        ),
        outflows: -parseFloat(
            String(
                currency === 'USD'
                    ? (flow.outflow_usd ?? 0)
                    : (flow.outflow_vnd ?? 0)
            )
        ),
    }));

    const chartConfig = {
        inflows: { label: 'Inflows', color: '#4CAF50' },
        outflows: { label: 'Outflows', color: '#F44336' },
    };

    return (
        <ChartContainer config={chartConfig} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-muted"
                    />
                    <XAxis
                        dataKey="name"
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
                        tickFormatter={(value) =>
                            Math.abs(value).toLocaleString()
                        }
                    />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="font-medium">{label}</div>
                                    {payload.map((item, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center gap-2"
                                        >
                                            <div
                                                className="h-2 w-2 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        item.color,
                                                }}
                                            />
                                            <span className="text-muted-foreground">
                                                {item.name}:{' '}
                                                {Math.abs(
                                                    item.value as number
                                                ).toLocaleString()}{' '}
                                                {currency}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            );
                        }}
                    />
                    <Legend />
                    <Bar
                        dataKey="inflows"
                        fill="var(--color-inflows)"
                        radius={[4, 4, 0, 0]}
                    />
                    <Bar
                        dataKey="outflows"
                        fill="var(--color-outflows)"
                        radius={[4, 4, 0, 0]}
                    />
                </BarChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};

type SpendingByTag = Record<
    string,
    {
        amount_usd?: number | string;
        amount_vnd?: number | string;
        percentage?: number | string;
    }
>;

// Spending Breakdown Chart
export const SpendingChart: React.FC<{
    data: { by_tag?: SpendingByTag };
    currency?: Currency;
}> = ({ data, currency = 'USD' }) => {
    if (!data?.by_tag) return null;

    const tags = Object.entries(data.by_tag)
        .sort(
            ([, a], [, b]) =>
                parseFloat(String(b.amount_usd ?? 0)) -
                parseFloat(String(a.amount_usd ?? 0))
        )
        .slice(0, 10);

    const chartData = tags.map(([tag, spending], index) => ({
        name: tag,
        value: parseFloat(
            String(
                currency === 'USD'
                    ? (spending.amount_usd ?? 0)
                    : (spending.amount_vnd ?? 0)
            )
        ),
        percentage: parseFloat(String(spending.percentage ?? 0)),
        fill: CHART_COLORS[index % CHART_COLORS.length],
    }));

    const chartConfig = chartData.reduce(
        (acc, item) => {
            acc[item.name] = { label: item.name, color: item.fill };
            return acc;
        },
        {} as Record<string, { label: string; color: string }>
    );

    return (
        <ChartContainer config={chartConfig} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius="40%"
                        outerRadius="70%"
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Pie>
                    <Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0];
                            const entry = item.payload as (typeof chartData)[0];
                            return (
                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="font-medium">
                                        {entry.name}
                                    </div>
                                    <div className="text-muted-foreground">
                                        {entry.value.toLocaleString()}{' '}
                                        {currency} ({entry.percentage.toFixed(1)}
                                        %)
                                    </div>
                                </div>
                            );
                        }}
                    />
                    <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => (
                            <span className="text-xs">{value}</span>
                        )}
                    />
                </PieChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};

type PnLData = {
    realized_pnl_usd?: number | string;
    realized_pnl_vnd?: number | string;
    total_pnl_usd?: number | string;
    total_pnl_vnd?: number | string;
};

// P&L Chart (bar)
export const PnLChart: React.FC<{ data: PnLData; currency?: Currency }> = ({
    data,
    currency = 'USD',
}) => {
    if (!data) return null;

    const realizedPnL = parseFloat(
        String(
            currency === 'USD'
                ? (data.realized_pnl_usd ?? 0)
                : (data.realized_pnl_vnd ?? 0)
        )
    );
    const totalPnL = parseFloat(
        String(
            currency === 'USD'
                ? (data.total_pnl_usd ?? 0)
                : (data.total_pnl_vnd ?? 0)
        )
    );

    const chartData = [
        {
            name: 'Realized P&L',
            value: realizedPnL,
            fill: realizedPnL >= 0 ? '#4CAF50' : '#F44336',
        },
        {
            name: 'Total P&L',
            value: totalPnL,
            fill: totalPnL >= 0 ? '#4CAF50' : '#F44336',
        },
    ];

    const chartConfig = {
        value: { label: `P&L (${currency})`, color: '#4CAF50' },
    };

    return (
        <ChartContainer config={chartConfig} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-muted"
                    />
                    <XAxis
                        dataKey="name"
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
                        tickFormatter={(value) => value.toLocaleString()}
                    />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0];
                            return (
                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="font-medium">
                                        {item.payload.name}
                                    </div>
                                    <div className="text-muted-foreground">
                                        {(
                                            item.value as number
                                        ).toLocaleString()}{' '}
                                        {currency}
                                    </div>
                                </div>
                            );
                        }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};

// P&L Line Chart
const pnlLineChartConfig = {
    value: {
        label: 'P&L',
        color: 'hsl(142, 76%, 36%)',
    },
};

export const PnLLineChart: React.FC<{ data: PnLData; currency?: Currency }> = ({
    data,
    currency = 'USD',
}) => {
    if (!data) return null;

    const realizedPnL = parseFloat(
        String(
            currency === 'USD'
                ? (data.realized_pnl_usd ?? 0)
                : (data.realized_pnl_vnd ?? 0)
        )
    );
    const totalPnL = parseFloat(
        String(
            currency === 'USD'
                ? (data.total_pnl_usd ?? 0)
                : (data.total_pnl_vnd ?? 0)
        )
    );

    const chartData = [
        { category: 'Realized P&L', value: realizedPnL },
        { category: 'Total P&L', value: totalPnL },
    ];

    return (
        <ChartContainer config={pnlLineChartConfig} className="h-full w-full">
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
                        dataKey="category"
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
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                            return value.toLocaleString();
                        }}
                    />
                    <ChartTooltip
                        cursor={false}
                        content={
                            <ChartTooltipContent
                                formatter={(value) =>
                                    `${Number(value).toLocaleString()} ${currency}`
                                }
                            />
                        }
                    />
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-value)"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};

// APR Comparison Chart (vault APR vs benchmark)
export const AprChart: React.FC<{ apr?: number; benchmarkApr?: number }> = ({
    apr = 0,
    benchmarkApr = 0,
}) => {
    const chartData = [
        { name: 'Vault APR', value: apr, fill: '#3B82F6' },
        { name: 'Benchmark APR', value: benchmarkApr, fill: '#9CA3AF' },
    ];

    const chartConfig = {
        value: { label: 'APR (%)', color: '#3B82F6' },
    };

    return (
        <ChartContainer config={chartConfig} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-muted"
                    />
                    <XAxis
                        dataKey="name"
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
                        tickFormatter={(value) =>
                            `${Number(value).toFixed(2)}%`
                        }
                    />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0];
                            return (
                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="font-medium">
                                        {item.payload.name}
                                    </div>
                                    <div className="text-muted-foreground">
                                        {Number(item.value).toFixed(2)}%
                                    </div>
                                </div>
                            );
                        }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};

// APR as Line chart
const aprLineChartConfig = {
    value: {
        label: 'APR',
        color: 'hsl(217, 91%, 60%)',
    },
};

export const AprLineChart: React.FC<{
    apr?: number;
    benchmarkApr?: number;
}> = ({ apr = 0, benchmarkApr = 0 }) => {
    const chartData = [
        { category: 'Vault APR', value: apr },
        { category: 'Benchmark APR', value: benchmarkApr },
    ];

    return (
        <ChartContainer config={aprLineChartConfig} className="h-full w-full">
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
                        dataKey="category"
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
                        tickFormatter={(value) =>
                            `${Number(value).toFixed(2)}%`
                        }
                    />
                    <ChartTooltip
                        cursor={false}
                        content={
                            <ChartTooltipContent
                                formatter={(value) =>
                                    `${Number(value).toFixed(2)}%`
                                }
                            />
                        }
                    />
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-value)"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};

// Generic time-series line chart
export const TimeSeriesLineChart: React.FC<{
    labels: string[];
    datasets: Array<{
        label: string;
        data: number[];
        color?: string;
        fill?: boolean;
    }>;
    yFormat?: 'percent' | 'currency' | 'number';
    currency?: Currency;
}> = ({ labels, datasets, yFormat = 'number' }) => {
    // Create safe keys for CSS variables (no spaces or special characters)
    const datasetKeys = datasets.map((_, index) => `dataset${index}`);

    // Format labels to "Month Day" format and combine with data
    const chartData = labels.map((label, index) => {
        const date = new Date(label);
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
        const dataPoint: Record<string, string | number> = {
            date: formattedDate,
        };
        datasets.forEach((ds, dsIndex) => {
            dataPoint[datasetKeys[dsIndex]] = ds.data[index] || 0;
        });
        return dataPoint;
    });

    // Create chart config from datasets using safe keys
    const chartConfig = datasets.reduce(
        (acc, ds, index) => {
            const key = datasetKeys[index];
            acc[key] = {
                label: ds.label,
                color: ds.color ?? `hsl(${index * 60}, 70%, 50%)`,
            };
            return acc;
        },
        {} as Record<string, { label: string; color: string }>
    );

    const formatValue = (value: number) => {
        if (yFormat === 'percent') return `${Number(value).toFixed(2)}%`;
        if (yFormat === 'currency') return `$${value.toLocaleString()}`;
        return `${value.toLocaleString()}`;
    };

    return (
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
                        tickFormatter={formatValue}
                    />
                    <ChartTooltip
                        cursor={false}
                        content={
                            <ChartTooltipContent
                                formatter={(value) =>
                                    formatValue(Number(value))
                                }
                            />
                        }
                    />
                    {datasets.map((_, index) => (
                        <Line
                            key={datasetKeys[index]}
                            type="monotone"
                            dataKey={datasetKeys[index]}
                            stroke={`var(--color-${datasetKeys[index]})`}
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 6 }}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};

// Daily Spending Line Chart
type DailySpendingData = {
    by_day?: Record<
        string,
        { amount_usd?: number | string; amount_vnd?: number | string }
    >;
};

const dailySpendingChartConfig = {
    spending: {
        label: 'Daily Spending',
        color: 'hsl(25, 95%, 53%)',
    },
};

export const DailySpendingChart: React.FC<{
    data: DailySpendingData;
    currency?: Currency;
}> = ({ data, currency = 'USD' }) => {
    if (!data?.by_day) return null;

    const chartData = Object.entries(data.by_day)
        .map(
            ([day, d]: [
                string,
                { amount_usd?: number | string; amount_vnd?: number | string },
            ]) => ({
                day,
                spending: Math.abs(
                    parseFloat(
                        String(
                            currency === 'USD'
                                ? (d.amount_usd ?? 0)
                                : (d.amount_vnd ?? 0)
                        )
                    )
                ),
            })
        )
        .sort((a, b) => (a.day < b.day ? -1 : 1));

    return (
        <ChartContainer
            config={dailySpendingChartConfig}
            className="h-full w-full"
        >
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
                        dataKey="day"
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
                        tickFormatter={(value) =>
                            Math.abs(Number(value)).toLocaleString()
                        }
                    />
                    <ChartTooltip
                        cursor={false}
                        content={
                            <ChartTooltipContent
                                formatter={(value) =>
                                    `${Math.abs(Number(value)).toLocaleString()} ${currency}`
                                }
                            />
                        }
                    />
                    <Line
                        type="monotone"
                        dataKey="spending"
                        stroke="var(--color-spending)"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};

// Monthly Spending Trend Chart (Bar chart showing 12 months)
type MonthlyTrendData = {
    monthly_trend?: Array<{
        month: string;
        amount_usd: number;
        amount_vnd: number;
    }>;
};

export const MonthlySpendingTrendChart: React.FC<{
    data: MonthlyTrendData;
    currency?: Currency;
}> = ({ data, currency = 'USD' }) => {
    if (!data?.monthly_trend || data.monthly_trend.length === 0) return null;

    const chartData = data.monthly_trend.map((m, index, arr) => {
        const [year, month] = m.month.split('-');
        const monthNames = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
        ];
        return {
            name: `${monthNames[parseInt(month, 10) - 1]} ${year.slice(2)}`,
            value: currency === 'USD' ? m.amount_usd : m.amount_vnd,
            isLast: index === arr.length - 1,
        };
    });

    const chartConfig = {
        value: { label: `Monthly Spending (${currency})`, color: '#F97316' },
    };

    return (
        <ChartContainer config={chartConfig} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-muted"
                    />
                    <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        className="text-xs"
                        angle={-45}
                        textAnchor="end"
                        height={60}
                    />
                    <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        className="text-xs"
                        tickFormatter={(value) => {
                            const symbol = currency === 'USD' ? '$' : '₫';
                            return `${symbol}${Number(value).toLocaleString()}`;
                        }}
                    />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0];
                            const symbol = currency === 'USD' ? '$' : '₫';
                            return (
                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="font-medium">
                                        {item.payload.name}
                                    </div>
                                    <div className="text-muted-foreground">
                                        {symbol}
                                        {(
                                            item.value as number
                                        ).toLocaleString()}
                                    </div>
                                </div>
                            );
                        }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={
                                    entry.isLast
                                        ? '#F97316'
                                        : 'rgba(249, 115, 22, 0.6)'
                                }
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};

// Spending Comparison Chart (Current vs Last Month by category)
export const SpendingComparisonChart: React.FC<{
    currentMonthData: Record<string, number>;
    lastMonthData: Record<string, number>;
    currency?: Currency;
}> = ({ currentMonthData, lastMonthData, currency = 'USD' }) => {
    // Get all unique categories
    const allCategories = [
        ...new Set([
            ...Object.keys(currentMonthData),
            ...Object.keys(lastMonthData),
        ]),
    ]
        .sort((a, b) => (currentMonthData[b] || 0) - (currentMonthData[a] || 0))
        .slice(0, 8); // Top 8 categories

    if (allCategories.length === 0) return null;

    const chartData = allCategories.map((cat) => ({
        name: cat,
        current: currentMonthData[cat] || 0,
        last: lastMonthData[cat] || 0,
    }));

    const chartConfig = {
        current: { label: 'Current Month', color: '#F97316' },
        last: { label: 'Last Month', color: '#9CA3AF' },
    };

    return (
        <ChartContainer config={chartConfig} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-muted"
                    />
                    <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        className="text-xs"
                        angle={-45}
                        textAnchor="end"
                        height={60}
                    />
                    <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        className="text-xs"
                        tickFormatter={(value) => {
                            const symbol = currency === 'USD' ? '$' : '₫';
                            return `${symbol}${Number(value).toLocaleString()}`;
                        }}
                    />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const symbol = currency === 'USD' ? '$' : '₫';
                            return (
                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="font-medium">{label}</div>
                                    {payload.map((item, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center gap-2"
                                        >
                                            <div
                                                className="h-2 w-2 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        item.color,
                                                }}
                                            />
                                            <span className="text-muted-foreground">
                                                {item.name === 'current'
                                                    ? 'Current Month'
                                                    : 'Last Month'}
                                                : {symbol}
                                                {(
                                                    item.value as number
                                                ).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            );
                        }}
                    />
                    <Legend
                        formatter={(value) =>
                            value === 'current' ? 'Current Month' : 'Last Month'
                        }
                    />
                    <Bar
                        dataKey="current"
                        fill="var(--color-current)"
                        radius={[4, 4, 0, 0]}
                    />
                    <Bar
                        dataKey="last"
                        fill="var(--color-last)"
                        radius={[4, 4, 0, 0]}
                    />
                </BarChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};

// Summary Stats Component
export const SummaryStats: React.FC<{
    title: string;
    stats: Array<{ label: string; value: number | string }>;
    currency?: Currency;
}> = ({ title, stats, currency = 'USD' }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 gap-4">
                    {stats.map((stat, index) => (
                        <div
                            key={index}
                            className="flex justify-between items-center"
                        >
                            <span className="text-sm text-gray-500">
                                {stat.label}
                            </span>
                            <span
                                className={`text-sm font-medium ${
                                    Number(stat.value) >= 0
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                }`}
                            >
                                {typeof stat.value === 'number'
                                    ? `${stat.value.toLocaleString()} ${currency}`
                                    : stat.value}
                            </span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};
