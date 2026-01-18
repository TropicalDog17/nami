import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import QuickBorrowLoanModal from '../components/modals/QuickBorrowLoanModal';
import QuickRepayModal from '../components/modals/QuickRepayModal';
import { useToast } from '../components/ui/Toast';
import {
    ApiError,
    borrowingsApi,
    portfolioApi,
    transactionApi,
} from '../services/api';
import { formatCurrency } from '../utils/currencyFormatter';

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

    const [borrowingsSummary, setBorrowingsSummary] =
        useState<BorrowingsSummary | null>(null);
    const [borrowingsAgreements, setBorrowingsAgreements] = useState<
        BorrowingAgreement[]
    >([]);
    const [lastUpdated, setLastUpdated] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [showBorrowModal, setShowBorrowModal] = useState(false);
    const [showRepayModal, setShowRepayModal] = useState(false);

    const refreshBorrowings = useCallback(async () => {
        setLoading(true);
        try {
            const r = await portfolioApi.report<Record<string, unknown>>();
            const liabs = Array.isArray(r?.liabilities) ? r.liabilities : [];
            const mapped = liabs.map((o: Record<string, unknown>) => {
                const counterpartyRaw = o?.counterparty;
                const counterparty =
                    typeof counterpartyRaw === 'string' ? counterpartyRaw : '';
                const assetRaw = o?.asset;
                let asset = '';
                if (typeof assetRaw === 'string') {
                    asset = assetRaw;
                } else if (typeof assetRaw === 'object' && assetRaw !== null) {
                    const symbolRaw = (assetRaw as Record<string, unknown>)
                        .symbol;
                    asset = typeof symbolRaw === 'string' ? symbolRaw : '';
                }
                return {
                    counterparty,
                    asset,
                    amount: Number(o?.amount ?? 0),
                    valueUSD: Number(o?.valueUSD ?? 0),
                };
            });
            const outstandingUSD = mapped.reduce(
                (s: number, x: { valueUSD?: number }) =>
                    s + (Number(x.valueUSD) || 0),
                0
            );
            setBorrowingsSummary({ outstandingUSD, liabilities: mapped });
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
    }, [showErrorToast, shouldToast]);

    useEffect(() => {
        void refreshBorrowings();
    }, [refreshBorrowings]);

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
                await transactionApi.repay({
                    asset: toAssetObj(d.asset),
                    amount: Number(d.amount),
                    counterparty: d.counterparty ?? 'general',
                    note: d.note ?? undefined,
                    direction: d.direction,
                    at: d.date,
                } as {
                    asset: { symbol?: string };
                    amount: number;
                    counterparty: string;
                    note?: string;
                    direction: string;
                    at: string;
                });
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
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-1">
                        Borrowing
                    </h1>
                    <p className="text-gray-600">
                        Track agreements, repayments, and cashflow estimates.
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

            <Card className="mb-6">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-lg font-semibold">
                        Borrowing Plan
                    </CardTitle>
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

            <Card className="mb-6">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-lg font-semibold">
                        Borrowing Overview
                    </CardTitle>
                    {lastUpdated && (
                        <span className="text-xs text-gray-500">
                            Updated {lastUpdated}
                        </span>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <div className="text-gray-500 text-sm">
                                Outstanding Balance
                            </div>
                            <div className="text-2xl font-bold text-red-700">
                                {formatCurrency(
                                    Math.abs(
                                        borrowingsSummary?.outstandingUSD ?? 0
                                    )
                                )}
                            </div>
                            <div className="text-xs text-gray-500">
                                Liability total (USD)
                            </div>
                        </div>
                        <div>
                            <div className="text-gray-500 text-sm">
                                Active Agreements
                            </div>
                            <div className="text-xl font-semibold">
                                {borrowingsAgreements.length}
                            </div>
                        </div>
                        <div>
                            <div className="text-gray-500 text-sm">
                                Next Due
                            </div>
                            <div className="text-sm font-medium">
                                {nextDueDate}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {loading && (
                <div className="flex items-center justify-center h-24">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
            )}

            <Card className="mb-6">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold">
                        Liabilities by Counterparty
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {borrowingsSummary?.liabilities?.length ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-600">
                                        <th className="py-2 pr-4">
                                            Counterparty
                                        </th>
                                        <th className="py-2 pr-4">Asset</th>
                                        <th className="py-2 pr-4">Amount</th>
                                        <th className="py-2 pr-4">
                                            Value (USD)
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {borrowingsSummary.liabilities.map(
                                        (o, idx) => (
                                            <tr
                                                key={`${o.counterparty}-${o.asset}-${idx}`}
                                                className="border-t"
                                            >
                                                <td className="py-2 pr-4">
                                                    {o.counterparty ||
                                                        'general'}
                                                </td>
                                                <td className="py-2 pr-4">
                                                    {o.asset}
                                                </td>
                                                <td className="py-2 pr-4">
                                                    {Number(
                                                        o.amount
                                                    ).toLocaleString(
                                                        undefined,
                                                        {
                                                            maximumFractionDigits: 6,
                                                        }
                                                    )}
                                                </td>
                                                <td className="py-2 pr-4">
                                                    {formatCurrency(o.valueUSD)}
                                                </td>
                                            </tr>
                                        )
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">
                            No liabilities recorded yet.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold">
                        Active Borrowing Agreements
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {borrowingsAgreements.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-600">
                                        <th className="py-2 pr-4">
                                            Counterparty
                                        </th>
                                        <th className="py-2 pr-4">Asset</th>
                                        <th className="py-2 pr-4">
                                            Outstanding
                                        </th>
                                        <th className="py-2 pr-4">
                                            Est. Monthly Payment
                                        </th>
                                        <th className="py-2 pr-4">Next Due</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {borrowingsAgreements.map((b) => (
                                        <tr key={b.id} className="border-t">
                                            <td className="py-2 pr-4">
                                                {b.counterparty || 'general'}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {b.asset?.symbol || 'USD'}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {Number(
                                                    b.outstanding
                                                ).toLocaleString(undefined, {
                                                    maximumFractionDigits: 6,
                                                })}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {b.monthlyPayment
                                                    ? Number(
                                                          b.monthlyPayment
                                                      ).toLocaleString(
                                                          undefined,
                                                          {
                                                              maximumFractionDigits: 6,
                                                          }
                                                      )
                                                    : '-'}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {b.nextPaymentAt
                                                    ? new Date(
                                                          b.nextPaymentAt
                                                      ).toLocaleDateString()
                                                    : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">
                            No active borrowing agreements yet.
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
