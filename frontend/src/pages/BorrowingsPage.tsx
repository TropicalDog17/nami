import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';

import QuickBorrowLoanModal from '../components/modals/QuickBorrowLoanModal';
import QuickRepayModal from '../components/modals/QuickRepayModal';
import { CurrencyToggle } from '../components/ui/CurrencyToggle';
import { useToast } from '../components/ui/Toast';
import {
    ApiError,
    borrowingsApi,
    portfolioApi,
    transactionApi,
} from '../services/api';
import { fxService } from '../services/fxService';
import { formatCurrency } from '../utils/currencyFormatter';

// Chart colors palette
const CHART_COLORS = [
    '#FF6384',
    '#36A2EB',
    '#FFCE56',
    '#4BC0C0',
    '#9966FF',
    '#FF9F40',
    '#C9CBCF',
];

type BorrowingsSummary = {
    outstandingUSD: number;
    liabilities: Array<{
        counterparty: string;
        asset: string;
        amount: number;
        valueUSD: number;
    }>;
};

type BorrowingAgreement = {
    id: string;
    counterparty: string;
    asset: { symbol?: string };
    principal: number;
    monthlyPayment: number;
    nextPaymentAt: string;
    outstanding: number;
    status: string;
};

// Merged debt item for the unified table
type MergedDebtItem = {
    id: string;
    counterparty: string;
    asset: string;
    principal: number;
    outstanding: number;
    percentPaid: number | null;
    monthlyPayment: number | null;
    nextPaymentAt: string | null;
    valueUSD: number;
    source: 'agreement' | 'liability';
};

// Progress bar component for table cells
const ProgressBar: React.FC<{ percent: number | null }> = ({ percent }) => {
    if (percent === null) {
        return <span className="text-gray-400 text-sm">N/A</span>;
    }

    const getColorClass = (p: number) => {
        if (p >= 75) return 'bg-green-500';
        if (p >= 25) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div className="flex items-center gap-2">
            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full ${getColorClass(percent)}`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                />
            </div>
            <span className="text-sm text-gray-600 w-12">
                {percent.toFixed(0)}%
            </span>
        </div>
    );
};

// Stat card component
const StatCard: React.FC<{
    label: string;
    value: string | number;
    subtext?: string;
    variant?: 'default' | 'danger' | 'success';
    icon?: React.ReactNode;
}> = ({ label, value, subtext, variant = 'default', icon }) => {
    const colorClasses = {
        default: 'text-gray-900',
        danger: 'text-red-700',
        success: 'text-green-700',
    };

    return (
        <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                {icon}
                {label}
            </div>
            <div className={`text-2xl font-bold ${colorClasses[variant]}`}>
                {value}
            </div>
            {subtext && (
                <div className="text-xs text-gray-500 mt-1">{subtext}</div>
            )}
        </div>
    );
};

// Circular progress indicator
const CircularProgress: React.FC<{ percent: number }> = ({ percent }) => {
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percent / 100) * circumference;

    const getColor = (p: number) => {
        if (p >= 75) return '#22c55e';
        if (p >= 25) return '#eab308';
        return '#ef4444';
    };

    return (
        <div className="relative inline-flex items-center justify-center">
            <svg width="56" height="56" className="-rotate-90">
                <circle
                    cx="28"
                    cy="28"
                    r={radius}
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="4"
                />
                <circle
                    cx="28"
                    cy="28"
                    r={radius}
                    fill="none"
                    stroke={getColor(percent)}
                    strokeWidth="4"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                />
            </svg>
            <span className="absolute text-sm font-semibold">
                {percent.toFixed(0)}%
            </span>
        </div>
    );
};

const toAssetObj = (symbol: string) => ({
    type:
        symbol.toUpperCase() === 'USD' || symbol.length === 3
            ? ('FIAT' as const)
            : ('CRYPTO' as const),
    symbol: symbol.toUpperCase(),
});

const toIsoDate = (date: string) =>
    date.includes('T') ? date : new Date(`${date}T00:00:00Z`).toISOString();

const BorrowingsPage: React.FC = () => {
    const { error: showErrorToast, success: showSuccessToast } = useToast();
    const shouldToast = useCallback(
        (e: unknown) => !(e instanceof ApiError && e.status === 0),
        []
    );

    // Local currency state for this page only
    const [currency, setCurrency] = useState<'USD' | 'VND'>('USD');

    const [borrowingsSummary, setBorrowingsSummary] =
        useState<BorrowingsSummary | null>(null);
    const [borrowingsAgreements, setBorrowingsAgreements] = useState<
        BorrowingAgreement[]
    >([]);
    const [lastUpdated, setLastUpdated] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [showBorrowModal, setShowBorrowModal] = useState(false);
    const [showRepayModal, setShowRepayModal] = useState(false);
    const [showPlanCard, setShowPlanCard] = useState(true);
    const [fxRate, setFxRate] = useState<number>(1);

    // Fetch FX rate when currency changes
    useEffect(() => {
        const fetchFxRate = async () => {
            if (currency === 'VND') {
                const rate = await fxService.getFXRate('USD', 'VND');
                setFxRate(rate);
            } else {
                setFxRate(1);
            }
        };
        void fetchFxRate();
    }, [currency]);

    // Helper to convert and format currency
    const displayCurrency = useCallback(
        (valueUSD: number) => {
            const converted = currency === 'VND' ? valueUSD * fxRate : valueUSD;
            return formatCurrency(converted, currency);
        },
        [currency, fxRate]
    );

    const refreshBorrowings = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch borrowing agreements directly - no need for report API
            const agreements =
                await borrowingsApi.list<Array<Record<string, unknown>>>({
                    status: 'ACTIVE',
                });
            const normalized = (agreements ?? []).map(
                (b: Record<string, unknown>) => ({
                    id: String(b.id ?? ''),
                    counterparty: String(b.counterparty ?? ''),
                    asset:
                        typeof b.asset === 'object' && b.asset
                            ? (b.asset as { symbol?: string })
                            : { symbol: '' },
                    principal: Number(b.principal ?? 0),
                    monthlyPayment: Number(b.monthlyPayment ?? 0),
                    nextPaymentAt: String(b.nextPaymentAt ?? ''),
                    outstanding: Number(b.outstanding ?? 0),
                    status: String(b.status ?? ''),
                })
            );
            setBorrowingsAgreements(normalized);
            
            // Calculate total outstanding from borrowings only
            const totalOutstanding = normalized.reduce(
                (sum, b) => sum + b.outstanding,
                0
            );
            setBorrowingsSummary({ outstandingUSD: totalOutstanding, liabilities: [] });
            
            setLastUpdated(new Date().toLocaleString());
        } catch (err: unknown) {
            if (shouldToast(err)) {
                showErrorToast(
                    err instanceof Error
                        ? err.message
                        : 'Failed to load borrowings'
                );
            }
        } finally {
            setLoading(false);
        }
    }, [showErrorToast, shouldToast]);;

    useEffect(() => {
        void refreshBorrowings();
    }, [refreshBorrowings]);

    const debtItems = useMemo((): MergedDebtItem[] => {
        const items: MergedDebtItem[] = [];

        for (const agreement of borrowingsAgreements) {
            const principal = agreement.principal || 0;
            const outstanding = agreement.outstanding || 0;
            const percentPaid =
                principal > 0
                    ? ((principal - outstanding) / principal) * 100
                    : null;

            // Use outstanding as valueUSD directly
            // Note: The borrowings table stores outstanding in the native asset currency,
            // but for now we'll assume it's in USD or treat it as USD equivalent
            // In the future, we may need to fetch FX rates for proper conversion
            items.push({
                id: agreement.id,
                counterparty: agreement.counterparty || 'general',
                asset: agreement.asset?.symbol || 'USD',
                principal,
                outstanding,
                percentPaid,
                monthlyPayment: agreement.monthlyPayment || null,
                nextPaymentAt: agreement.nextPaymentAt || null,
                valueUSD: outstanding, // Assuming outstanding is in USD or USD-equivalent
                source: 'agreement',
            });
        }

        return items;
    }, [borrowingsAgreements]);;

    // Calculate summary statistics
    const summaryStats = useMemo(() => {
        const totalPrincipal = debtItems
            .filter((d) => d.principal > 0)
            .reduce((sum, d) => sum + d.principal, 0);

        const totalOutstanding = debtItems.reduce(
            (sum, d) => sum + d.outstanding,
            0
        );

        const totalPaid = debtItems
            .filter((d) => d.principal > 0)
            .reduce((sum, d) => sum + (d.principal - d.outstanding), 0);

        const overallProgress =
            totalPrincipal > 0
                ? ((totalPrincipal - totalOutstanding) / totalPrincipal) * 100
                : 0;

        const activeLoans = borrowingsAgreements.length;

        return {
            totalDebt: borrowingsSummary?.outstandingUSD ?? totalOutstanding,
            totalPaid,
            overallProgress: Math.max(0, Math.min(100, overallProgress)),
            activeLoans,
        };
    }, [debtItems, borrowingsAgreements, borrowingsSummary]);

    // Prepare donut chart data - group by counterparty
    const donutChartData = useMemo(() => {
        const byCounterparty: Record<string, number> = {};

        for (const item of debtItems) {
            const cp = item.counterparty || 'general';
            byCounterparty[cp] = (byCounterparty[cp] || 0) + item.valueUSD;
        }

        const total = Object.values(byCounterparty).reduce((a, b) => a + b, 0);

        return Object.entries(byCounterparty)
            .map(([name, value], index) => ({
                name,
                value: Math.abs(value),
                percentage: total > 0 ? (Math.abs(value) / total) * 100 : 0,
                fill: CHART_COLORS[index % CHART_COLORS.length],
            }))
            .sort((a, b) => b.value - a.value);
    }, [debtItems]);

    const chartConfig = useMemo(() => {
        return donutChartData.reduce(
            (acc, item) => {
                acc[item.name] = { label: item.name, color: item.fill };
                return acc;
            },
            {} as Record<string, { label: string; color: string }>
        );
    }, [donutChartData]);

    const nextDueDate = useMemo(() => {
        const dates = borrowingsAgreements
            .map((b) => b.nextPaymentAt)
            .filter((d) => Boolean(d))
            .map((d) => new Date(d).getTime())
            .filter((d) => !Number.isNaN(d));
        if (dates.length === 0) return '-';
        const next = Math.min(...dates);
        return new Date(next).toLocaleDateString();
    }, [borrowingsAgreements]);

    const handleBorrowSubmit = useCallback(
        async (d: {
            startDate: string;
            firstDueDate?: string;
            amount: number;
            monthlyPayment?: number;
            asset: string;
            counterparty?: string;
            note?: string;
        }) => {
            try {
                const startAt = toIsoDate(d.startDate);
                const firstDueAt = toIsoDate(d.firstDueDate ?? d.startDate);
                await borrowingsApi.create({
                    asset: toAssetObj(d.asset),
                    principal: Number(d.amount),
                    monthlyPayment: Number(d.monthlyPayment ?? 0),
                    counterparty: d.counterparty ?? 'general',
                    note: d.note ?? undefined,
                    startAt,
                    firstDueAt,
                } as {
                    asset: { symbol?: string };
                    principal: number;
                    monthlyPayment: number;
                    counterparty: string;
                    note?: string;
                    startAt: string;
                    firstDueAt: string;
                });
                showSuccessToast('Borrowing saved');
                await refreshBorrowings();
                setShowBorrowModal(false);
            } catch (err: unknown) {
                if (shouldToast(err)) {
                    showErrorToast(
                        err instanceof Error
                            ? err.message
                            : 'Failed to save borrowing'
                    );
                }
            }
        },
        [refreshBorrowings, showErrorToast, showSuccessToast, shouldToast]
    );

    const handleRepaySubmit = useCallback(
        async (d: {
            date: string;
            amount: number;
            asset: string;
            counterparty?: string;
            note?: string;
            direction: 'BORROW' | 'LOAN';
        }) => {
            try {
                const at = toIsoDate(d.date);
                // For BORROW direction, use the borrowings/repay endpoint which properly deducts from borrowing
                if (d.direction === 'BORROW') {
                    await borrowingsApi.repay({
                        counterparty: d.counterparty ?? 'general',
                        asset: toAssetObj(d.asset),
                        amount: Number(d.amount),
                        at,
                        note: d.note,
                    });
                } else {
                    // For LOAN direction, use the generic transaction repay endpoint
                    await transactionApi.repay({
                        asset: toAssetObj(d.asset),
                        amount: Number(d.amount),
                        counterparty: d.counterparty ?? 'general',
                        note: d.note ?? undefined,
                        direction: d.direction,
                        at,
                    } as {
                        asset: { symbol?: string };
                        amount: number;
                        counterparty: string;
                        note?: string;
                        direction: string;
                        at: string;
                    });
                }
                showSuccessToast('Repayment saved');
                await refreshBorrowings();
                setShowRepayModal(false);
            } catch (err: unknown) {
                if (shouldToast(err)) {
                    showErrorToast(
                        err instanceof Error
                            ? err.message
                            : 'Failed to save repayment'
                    );
                }
            }
        },
        [refreshBorrowings, showErrorToast, showSuccessToast, shouldToast]
    );

    return (
        <div className="px-4 py-6 sm:px-0">
            {/* Page Header */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-1">
                        Borrowing
                    </h1>
                    <p className="text-gray-600">
                        Track agreements, repayments, and progress.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={() => {
                            setShowBorrowModal(true);
                            setShowRepayModal(false);
                        }}
                        variant="destructive"
                        size="sm"
                    >
                        Record Borrow
                    </Button>
                    <Button
                        onClick={() => {
                            setShowRepayModal(true);
                            setShowBorrowModal(false);
                        }}
                        size="sm"
                    >
                        Record Repayment
                    </Button>
                </div>
            </div>

            {/* Currency Toggle */}
            <div className="mb-6">
                <CurrencyToggle
                    currency={currency}
                    onCurrencyChange={setCurrency}
                />
            </div>

            {/* Overview Section - Two Columns */}
            <Card className="mb-6">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-lg font-semibold">
                        Debt Overview
                    </CardTitle>
                    {lastUpdated && (
                        <span className="text-xs text-gray-500">
                            Updated {lastUpdated}
                        </span>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left: Donut Chart */}
                        <div className="flex flex-col items-center">
                            {donutChartData.length > 0 ? (
                                <ChartContainer
                                    config={chartConfig}
                                    className="h-64 w-full"
                                >
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                    >
                                        <PieChart>
                                            <Pie
                                                data={donutChartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="50%"
                                                outerRadius="80%"
                                                paddingAngle={2}
                                                dataKey="value"
                                                nameKey="name"
                                                label={({
                                                    cx,
                                                    cy,
                                                    midAngle,
                                                    outerRadius,
                                                    percentage,
                                                }: {
                                                    cx: number;
                                                    cy: number;
                                                    midAngle: number;
                                                    outerRadius: number;
                                                    percentage: number;
                                                }) => {
                                                    const RADIAN =
                                                        Math.PI / 180;
                                                    const radius =
                                                        outerRadius + 20;
                                                    const x =
                                                        cx +
                                                        radius *
                                                            Math.cos(
                                                                -midAngle *
                                                                    RADIAN
                                                            );
                                                    const y =
                                                        cy +
                                                        radius *
                                                            Math.sin(
                                                                -midAngle *
                                                                    RADIAN
                                                            );
                                                    return (
                                                        <text
                                                            x={x}
                                                            y={y}
                                                            fill="#374151"
                                                            textAnchor={
                                                                x > cx
                                                                    ? 'start'
                                                                    : 'end'
                                                            }
                                                            dominantBaseline="central"
                                                            style={{
                                                                fontSize:
                                                                    '11px',
                                                                fontWeight: 500,
                                                            }}
                                                        >
                                                            {`${(percentage).toFixed(0)}%`}
                                                        </text>
                                                    );
                                                }}
                                                labelLine={{
                                                    stroke: '#9ca3af',
                                                    strokeWidth: 1,
                                                }}
                                            >
                                                {donutChartData.map(
                                                    (entry, index) => (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={entry.fill}
                                                        />
                                                    )
                                                )}
                                            </Pie>
                                            <Tooltip
                                                content={({
                                                    active,
                                                    payload,
                                                }) => {
                                                    if (
                                                        !active ||
                                                        !payload?.length
                                                    )
                                                        return null;
                                                    const item = payload[0];
                                                    const entry = item.payload as (typeof donutChartData)[0];
                                                    return (
                                                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                            <div className="font-medium">
                                                                {entry.name}
                                                            </div>
                                                            <div className="text-muted-foreground">
                                                                {displayCurrency(
                                                                    entry.value
                                                                )}{' '}
                                                                (
                                                                {entry.percentage.toFixed(
                                                                    1
                                                                )}
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
                                                    <span className="text-xs">
                                                        {value}
                                                    </span>
                                                )}
                                            />
                                            {/* Center text */}
                                            <text
                                                x="50%"
                                                y="45%"
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                className="fill-gray-500"
                                                style={{ fontSize: '10px' }}
                                            >
                                                Total Debt
                                            </text>
                                            <text
                                                x="50%"
                                                y="55%"
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                className="fill-gray-900 font-bold"
                                                style={{ fontSize: '12px' }}
                                            >
                                                {displayCurrency(
                                                    summaryStats.totalDebt
                                                )}
                                            </text>
                                        </PieChart>
                                    </ResponsiveContainer>
                                </ChartContainer>
                            ) : (
                                <div className="h-64 flex items-center justify-center text-gray-500">
                                    No debt data to display
                                </div>
                            )}
                        </div>

                        {/* Right: Stats Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <StatCard
                                label="Total Debt"
                                value={displayCurrency(summaryStats.totalDebt)}
                                subtext="Outstanding balance"
                                variant="danger"
                            />
                            <StatCard
                                label="Total Paid"
                                value={displayCurrency(summaryStats.totalPaid)}
                                subtext="Principal repaid"
                                variant="success"
                            />
                            <div className="bg-white rounded-lg border p-4 flex flex-col items-center justify-center">
                                <div className="text-gray-500 text-sm mb-2">
                                    Overall Progress
                                </div>
                                <CircularProgress
                                    percent={summaryStats.overallProgress}
                                />
                                <div className="text-xs text-gray-500 mt-2">
                                    of principal paid
                                </div>
                            </div>
                            <StatCard
                                label="Active Loans"
                                value={summaryStats.activeLoans}
                                subtext={`Next due: ${nextDueDate}`}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Collapsible Borrowing Plan Card */}
            {showPlanCard && (
                <Card className="mb-6">
                    <CardHeader className="space-y-1">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold">
                                Borrowing Plan
                            </CardTitle>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowPlanCard(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                Hide
                            </Button>
                        </div>
                        <p className="text-sm text-gray-500">
                            A simple workflow to keep obligations visible and
                            predictable.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2">
                            <li>
                                Capture each borrowing agreement with principal,
                                counterparty, and first due date.
                            </li>
                            <li>
                                Add an estimated monthly payment for cashflow
                                forecasting.
                            </li>
                            <li>
                                Log repayments as they happen to keep balances
                                accurate.
                            </li>
                            <li>
                                Review upcoming due dates to avoid surprises.
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            )}

            {loading && (
                <div className="flex items-center justify-center h-24">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
            )}

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold">
                        Debt Details
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {debtItems.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-600">
                                        <th className="py-2 pr-4">
                                            Counterparty
                                        </th>
                                        <th className="py-2 pr-4">Asset</th>
                                        <th className="py-2 pr-4">Principal</th>
                                        <th className="py-2 pr-4">
                                            Outstanding
                                        </th>
                                        <th className="py-2 pr-4">Progress</th>
                                        <th className="py-2 pr-4">
                                            Monthly Payment
                                        </th>
                                        <th className="py-2 pr-4">Next Due</th>
                                        <th className="py-2 pr-4">
                                            Value ({currency})
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {debtItems.map((item) => (
                                        <tr key={item.id} className="border-t">
                                            <td className="py-3 pr-4">
                                                {item.counterparty}
                                            </td>
                                            <td className="py-3 pr-4">
                                                {item.asset}
                                            </td>
                                            <td className="py-3 pr-4">
                                                {item.principal > 0
                                                    ? Number(
                                                          item.principal
                                                      ).toLocaleString(
                                                          undefined,
                                                          {
                                                              maximumFractionDigits: 2,
                                                          }
                                                      )
                                                    : '-'}
                                            </td>
                                            <td className="py-3 pr-4 font-medium text-red-700">
                                                {Number(
                                                    item.outstanding
                                                ).toLocaleString(undefined, {
                                                    maximumFractionDigits: 2,
                                                })}
                                            </td>
                                            <td className="py-3 pr-4">
                                                <ProgressBar
                                                    percent={item.percentPaid}
                                                />
                                            </td>
                                            <td className="py-3 pr-4">
                                                {item.monthlyPayment
                                                    ? Number(
                                                          item.monthlyPayment
                                                      ).toLocaleString(
                                                          undefined,
                                                          {
                                                              maximumFractionDigits: 2,
                                                          }
                                                      )
                                                    : '-'}
                                            </td>
                                            <td className="py-3 pr-4">
                                                {item.nextPaymentAt
                                                    ? new Date(
                                                          item.nextPaymentAt
                                                      ).toLocaleDateString()
                                                    : '-'}
                                            </td>
                                            <td className="py-3 pr-4">
                                                {displayCurrency(item.valueUSD)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">
                            No debts recorded yet.
                        </p>
                    )}
                    <p className="text-xs text-gray-500 mt-3">
                        Monthly payments are estimates used for cashflow
                        prediction only.
                    </p>
                </CardContent>
            </Card>

            <QuickBorrowLoanModal
                isOpen={showBorrowModal}
                mode="borrow"
                onClose={() => setShowBorrowModal(false)}
                onSubmit={async (d) => {
                    await handleBorrowSubmit(d);
                }}
            />
            <QuickRepayModal
                isOpen={showRepayModal}
                onClose={() => setShowRepayModal(false)}
                onSubmit={async (d) => {
                    await handleRepaySubmit(d);
                }}
                fixedDirection="BORROW"
            />
        </div>
    );
};

export default BorrowingsPage;
