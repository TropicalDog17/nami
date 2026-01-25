import React from 'react';
import {
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    ReferenceLine,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';

type Currency = 'USD' | 'VND';

type PredictedOutflowsSeriesItem = {
    date: string;
    predicted_spend_usd: number;
    predicted_spend_vnd: number;
    expected_repayments_usd: number;
    expected_repayments_vnd: number;
    total_out_usd: number;
    total_out_vnd: number;
};

export type PredictedOutflowsData = {
    start_date: string;
    end_date: string;
    account?: string;
    baseline_daily_spend_usd?: number;
    baseline_daily_spend_vnd?: number;
    totals: {
        predicted_spend_usd: number;
        predicted_spend_vnd: number;
        expected_repayments_usd: number;
        expected_repayments_vnd: number;
        total_out_usd: number;
        total_out_vnd: number;
    };
    series: PredictedOutflowsSeriesItem[];
};

type PredictedOutflowsModuleProps = {
    data: PredictedOutflowsData | null;
    currency: Currency;
};

const PredictedOutflowsModule: React.FC<PredictedOutflowsModuleProps> = ({
    data,
    currency,
}) => {
    if (!data) return null;

    const formatMoney = (amount: number) => {
        const abs = Math.abs(amount);
        const prefix = currency === 'USD' ? '$' : '₫';
        // USD: 2 decimals, VND: 0 decimals (whole number)
        const decimalPlaces = currency === 'VND' ? 0 : 2;
        return `${prefix}${abs.toLocaleString('en-US', {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces,
        })}`;
    };

    const outTotal =
        currency === 'USD' ? data.totals.total_out_usd : data.totals.total_out_vnd;
    const spendTotal =
        currency === 'USD'
            ? data.totals.predicted_spend_usd
            : data.totals.predicted_spend_vnd;
    const repayTotal =
        currency === 'USD'
            ? data.totals.expected_repayments_usd
            : data.totals.expected_repayments_vnd;

    const chartData = data.series.map((d) => ({
        date: d.date,
        predicted_spend:
            currency === 'USD' ? d.predicted_spend_usd : d.predicted_spend_vnd,
        expected_repayments:
            currency === 'USD'
                ? d.expected_repayments_usd
                : d.expected_repayments_vnd,
        total_out: currency === 'USD' ? d.total_out_usd : d.total_out_vnd,
    }));

    let runningOut = 0;
    const chartDataWithCum = chartData.map((d) => {
        const out_daily = -Math.abs(d.total_out || 0);
        runningOut += out_daily;
        return {
            ...d,
            out_daily,
            out_cum: runningOut,
        };
    });

    return (
        <div className="space-y-6 mb-8">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-medium">
                        Predicted Outflows ({data.start_date} → {data.end_date})
                    </CardTitle>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-red-50 border-red-200">
                    <CardContent className="p-4">
                        <h4 className="text-sm font-medium text-red-800">
                            Total Outflows
                        </h4>
                        <p className="text-2xl font-bold text-red-900">
                            -{formatMoney(outTotal)}
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-gray-50">
                    <CardContent className="p-4">
                        <h4 className="text-sm font-medium text-gray-800">
                            Spend (Included)
                        </h4>
                        <p className="text-2xl font-bold text-gray-900">
                            -{formatMoney(spendTotal)}
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-gray-50">
                    <CardContent className="p-4">
                        <h4 className="text-sm font-medium text-gray-800">
                            Repay (Included)
                        </h4>
                        <p className="text-2xl font-bold text-gray-900">
                            -{formatMoney(repayTotal)}
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-gray-50">
                    <CardContent className="p-4">
                        <h4 className="text-sm font-medium text-gray-800">
                            Avg Predicted Outflows / Day
                        </h4>
                        <p className="text-2xl font-bold text-gray-900">
                            -{formatMoney(outTotal / Math.max(1, data.series.length))}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="p-4">
                    <div style={{ height: '260px' }}>
                        <ChartContainer
                            config={{
                                outflows: { label: 'Outflows', color: '#dc2626' },
                            }}
                            className="h-full w-full"
                        >
                            <LineChart data={chartDataWithCum}>
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
                                    tickFormatter={(value) =>
                                        String(value).slice(5)
                                    }
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    className="text-xs"
                                    tickFormatter={(value) => {
                                        const prefix = currency === 'USD' ? '$' : '₫';
                                        const num = Number(value);
                                        // USD: 2 decimals, VND: 0 decimals (whole number)
                                        const decimalPlaces = currency === 'VND' ? 0 : 2;
                                        const formatted = `${prefix}${Math.abs(num).toLocaleString('en-US', {
                                            minimumFractionDigits: decimalPlaces,
                                            maximumFractionDigits: decimalPlaces,
                                        })}`;
                                        return num < 0 ? `-${formatted}` : formatted;
                                    }}
                                />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload?.length)
                                            return null;
                                        const p = payload[0]?.payload as {
                                            out_cum: number;
                                            out_daily: number;
                                            total_out: number;
                                            predicted_spend: number;
                                            expected_repayments: number;
                                        };
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="font-medium">
                                                    {String(label)}
                                                </div>
                                                <div className="text-muted-foreground">
                                                    Daily Outflows:{' '}
                                                    -{formatMoney(p.out_daily)}
                                                </div>
                                                <div className="text-muted-foreground">
                                                    Cumulative Outflows:{' '}
                                                    -{formatMoney(p.out_cum)}
                                                </div>
                                                <div className="text-muted-foreground">
                                                    Outflows:{' '}
                                                    -{formatMoney(p.total_out)}
                                                </div>
                                                <div className="text-muted-foreground">
                                                    Spend:{' '}
                                                    -{formatMoney(
                                                        p.predicted_spend
                                                    )}
                                                </div>
                                                <div className="text-muted-foreground">
                                                    Repay:{' '}
                                                    -{formatMoney(
                                                        p.expected_repayments
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }}
                                />
                                <ReferenceLine y={0} stroke="#94a3b8" />
                                <Line
                                    type="monotone"
                                    dataKey="out_cum"
                                    stroke="#dc2626"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                            </LineChart>
                        </ChartContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default PredictedOutflowsModule;
