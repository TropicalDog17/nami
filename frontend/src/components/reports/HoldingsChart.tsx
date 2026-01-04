/**
 * HoldingsChart - Doughnut chart displaying asset allocation by holding value
 */

import React from 'react';
import { Doughnut } from 'react-chartjs-2';

import { Card, CardContent } from '@/components/ui/card';

import type { Currency } from './chartConfig';

export type HoldingsData = {
    by_asset?: Record<
        string,
        { value_usd?: number | string; value_vnd?: number | string }
    >;
};

interface HoldingsChartProps {
    data: HoldingsData;
    currency?: Currency;
}

export const HoldingsChart: React.FC<HoldingsChartProps> = ({
    data,
    currency = 'USD',
}) => {
    if (!data?.by_asset) return null;

    const assets = Object.entries(data.by_asset);
    const labels = assets.map(([asset]) => asset);
    const values = assets.map(([, holding]) =>
        Math.abs(
            parseFloat(
                String(
                    currency === 'USD'
                        ? (holding.value_usd ?? 0)
                        : (holding.value_vnd ?? 0)
                )
            )
        )
    );

    const chartData = {
        labels,
        datasets: [
            {
                data: values,
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#9966FF',
                    '#FF9F40',
                    '#FF6384',
                    '#C9CBCF',
                ],
                hoverBackgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#9966FF',
                    '#FF9F40',
                    '#FF6384',
                    '#C9CBCF',
                ],
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom' as const,
                labels: {
                    boxWidth: 12,
                    padding: 10,
                },
            },
            title: {
                display: false,
            },
            tooltip: {
                callbacks: {
                    label: function (context: {
                        label?: string;
                        parsed: number;
                        dataset: { data: number[] };
                    }) {
                        const label = context.label ?? '';
                        const value = context.parsed;
                        const total = context.dataset.data.reduce(
                            (a: number, b: number) => a + b,
                            0
                        );
                        const percentage = ((value / total) * 100).toFixed(1);
                        return `${label}: ${value.toLocaleString()} ${currency} (${percentage}%)`;
                    },
                },
            },
        },
    };

    return (
        <Card>
            <CardContent>
                <Doughnut data={chartData} options={options} />
            </CardContent>
        </Card>
    );
};
