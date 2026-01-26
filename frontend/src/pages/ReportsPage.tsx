import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import AssetAllocationChart from '../components/reports/AssetAllocationChart';
import CashFlowChart from '../components/reports/CashFlowChart';
import {
    PnLChart,
    SpendingChart,
    DailySpendingChart,
    MonthlySpendingTrendChart,
} from '../components/reports/Charts';
import PredictedOutflowsModule, {
    PredictedOutflowsData,
} from '../components/reports/PredictedOutflowsModule';
import CategoryRow from '../components/reports/CategoryRow';
import DataTable, {
    TableColumn,
    TableRowBase,
} from '../components/ui/DataTable';
import DateInput from '../components/ui/DateInput';
import { useBackendStatus } from '../context/BackendStatusContext';
import { reportsApi, tokenizedVaultApi } from '../services/api';
import { fxService } from '../services/fxService';

type ReportsTabId = 'holdings' | 'allocation' | 'cashflow' | 'spending' | 'investments';

type ReportsPageProps = {
    initialTab?: ReportsTabId;
    visibleTabs?: ReportsTabId[];
    pageTitle?: string;
    pageDescription?: string;
};

const ALL_TABS: Array<{ id: ReportsTabId; name: string; icon: string }> = [
    { id: 'holdings', name: 'Holdings', icon: '📊' },
    { id: 'allocation', name: 'Asset Allocation', icon: '🥧' },
    { id: 'cashflow', name: 'Cash Flow', icon: '💸' },
    { id: 'spending', name: 'Spending', icon: '🛒' },
];

const DEFAULT_TITLE = 'Reports & Analytics';
const DEFAULT_DESCRIPTION =
    'View comprehensive financial reports including holdings, cash flow analysis, and spending insights.';

const ReportsPage = ({
    initialTab = 'holdings',
    visibleTabs,
    pageTitle = DEFAULT_TITLE,
    pageDescription = DEFAULT_DESCRIPTION,
}: ReportsPageProps) => {
    const [activeTab, setActiveTab] = useState<ReportsTabId>(initialTab);
    const [currency, setCurrency] = useState<'USD' | 'VND'>('USD');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<Record<string, unknown>>({});
    const [forecastDays, setForecastDays] = useState(30);

    const navigate = useNavigate();

    // Filters
    type Filters = {
        startDate: string;
        endDate: string;
        asOf: string;
        period: string;
        asset: string;
        account: string;
        tag: string;
        type: string;
    };
    const [filters, setFilters] = useState<Filters>({
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0], // 30 days ago
        endDate: new Date().toISOString().split('T')[0], // today
        asOf: new Date().toISOString().split('T')[0],
        period: '30', // days
        asset: '',
        account: '',
        tag: '',
        type: '',
    });

    const { isOnline } = useBackendStatus();

    const tabs = useMemo(() => {
        if (!visibleTabs?.length) return ALL_TABS;
        const visible = new Set(visibleTabs);
        return ALL_TABS.filter((tab) => visible.has(tab.id));
    }, [visibleTabs]);

    useEffect(() => {
        if (!tabs.length) return;
        if (!tabs.some((tab) => tab.id === activeTab)) {
            setActiveTab(tabs[0].id);
        }
    }, [activeTab, tabs]);

    const showTabBar = tabs.length > 1;
    const activeTabName = tabs.find((t) => t.id === activeTab)?.name;

    const fetchData = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);

        try {
            let result: unknown = null;
            const extraUpdates: Record<string, unknown> = {};

            switch (activeTab) {
                case 'holdings':
                    result = await reportsApi.holdings({ as_of: filters.asOf });
                    break;
                case 'allocation':
                    // Vault-based allocation: only show tokenized vaults, exclude individual assets and USDT
                    try {
                        const tokenized: Array<{
                            status?: string;
                            total_assets_under_management?: number | string;
                            name?: string;
                            token_symbol?: string;
                        }> | null = await tokenizedVaultApi.list();
                        const usdToVnd = await (async () => {
                            try {
                                const dt = new Date(filters.asOf);
                                const rate = await fxService.getFXRate(
                                    'USD',
                                    'VND',
                                    isNaN(dt.getTime()) ? undefined : dt
                                );
                                return rate || 24000;
                            } catch {
                                return 24000;
                            }
                        })();

                        const byAsset: Record<
                            string,
                            {
                                quantity: number;
                                value_usd: number;
                                value_vnd: number;
                                percentage: number;
                            }
                        > = {};
                        let totalUSD = 0;
                        let totalVND = 0;

                        // Only include active tokenized vaults
                        for (const v of tokenized ?? []) {
                            if ((v.status ?? '').toLowerCase() !== 'active')
                                continue;
                            const aumUSD =
                                Number(v.total_assets_under_management ?? 0) ||
                                0;
                            if (aumUSD <= 0) continue;

                            const label = v.name ?? v.token_symbol ?? 'Vault';
                            const aumVND = aumUSD * usdToVnd;

                            byAsset[label] = {
                                quantity: aumUSD,
                                value_usd: aumUSD,
                                value_vnd: aumVND,
                                percentage: 0, // calculated below
                            };

                            totalUSD += aumUSD;
                            totalVND += aumVND;
                        }

                        // Calculate percentages
                        if (totalUSD > 0) {
                            for (const key of Object.keys(byAsset)) {
                                byAsset[key].percentage =
                                    (byAsset[key].value_usd / totalUSD) * 100;
                            }
                        }

                        result = {
                            by_asset: byAsset,
                            total_value_usd: totalUSD,
                            total_value_vnd: totalVND,
                        };
                    } catch (e) {
                        console.error('Error loading vault allocation:', e);
                        result = {
                            by_asset: {},
                            total_value_usd: 0,
                            total_value_vnd: 0,
                        };
                    }
                    break;
                case 'cashflow':
                    {
                        const now = new Date();
                        const asOf = now.toISOString().split('T')[0];
                        const horizonDays = Math.max(1, forecastDays);
                        const horizonMonths = Math.max(
                            1,
                            Math.ceil(horizonDays / 30)
                        );

                        // Forecast starts next month; cap/align horizon to whole months.
                        // Example: Jan 18 + "30 days" => Feb 1 → Feb 28.
                        const monthAfterEndStart = new Date(
                            Date.UTC(
                                now.getUTCFullYear(),
                                now.getUTCMonth() + horizonMonths + 1,
                                1
                            )
                        );
                        const forecastEndDate = new Date(
                            monthAfterEndStart.getTime() -
                                24 * 60 * 60 * 1000
                        );
                        const forecastEnd = forecastEndDate
                            .toISOString()
                            .split('T')[0];
                        const [actual, predicted] = await Promise.all([
                            reportsApi.cashFlow({
                                start_date: filters.startDate,
                                end_date: filters.endDate,
                            }),
                            reportsApi.predictedOutflows({
                                start_date: asOf,
                                end_date: forecastEnd,
                            }),
                        ]);
                        result = actual;
                        extraUpdates.predicted_outflows = predicted;
                    }
                    break;
                case 'spending':
                    result = await reportsApi.spending({
                        start_date: filters.startDate,
                        end_date: filters.endDate,
                    });
                    break;
            }

            setData((prev) => ({ ...prev, [activeTab]: result, ...extraUpdates }));
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Unknown error';
            setError(`Failed to load ${activeTab}: ${message}`);
            console.error('Reports fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeTab, filters, forecastDays]);

    useEffect(() => {
        if (isOnline) {
            void fetchData();
        }
    }, [isOnline, fetchData]);

    const handleFilterChange = <K extends keyof Filters>(
        key: K,
        value: Filters[K]
    ) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const renderFilters = () => {
        return (
            <Card className="mb-6" data-testid="reports-filters">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Currency Toggle */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Currency
                            </label>
                            <div className="flex space-x-2">
                                <Button
                                    onClick={() => setCurrency('USD')}
                                    variant={
                                        currency === 'USD'
                                            ? 'default'
                                            : 'secondary'
                                    }
                                    size="sm"
                                    data-testid="currency-usd-button"
                                >
                                    USD
                                </Button>
                                <Button
                                    onClick={() => setCurrency('VND')}
                                    variant={
                                        currency === 'VND'
                                            ? 'default'
                                            : 'secondary'
                                    }
                                    size="sm"
                                    data-testid="currency-vnd-button"
                                >
                                    VND
                                </Button>
                            </div>
                        </div>

                        {/* Date Filters */}
                        {(activeTab === 'cashflow' ||
                            activeTab === 'spending') && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Start Date
                                    </label>
                                    <DateInput
                                        value={filters.startDate}
                                        onChange={(v) =>
                                            handleFilterChange('startDate', v)
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        End Date
                                    </label>
                                    <DateInput
                                        value={filters.endDate}
                                        onChange={(v) =>
                                            handleFilterChange('endDate', v)
                                        }
                                    />
                                </div>
                                {activeTab === 'cashflow' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Forecast Horizon
                                        </label>
                                        <select
                                            value={forecastDays}
                                            onChange={(e) => {
                                                const v = parseInt(
                                                    e.target.value
                                                );
                                                setForecastDays(
                                                    Number.isFinite(v) ? v : 30
                                                );
                                            }}
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                        >
                                            <option value={7}>
                                                Next 7 days
                                            </option>
                                            <option value={14}>
                                                Next 14 days
                                            </option>
                                            <option value={30}>
                                                Next 30 days
                                            </option>
                                            <option value={60}>
                                                Next 60 days
                                            </option>
                                            <option value={90}>
                                                Next 90 days
                                            </option>
                                        </select>
                                    </div>
                                )}
                            </>
                        )}

                        {/* As Of Date for Holdings */}
                        {activeTab === 'holdings' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    As Of Date
                                </label>
                                <DateInput
                                    value={filters.asOf}
                                    onChange={(v) =>
                                        handleFilterChange('asOf', v)
                                    }
                                />
                            </div>
                        )}

                        {/* Quick Date Presets */}
                        {(activeTab === 'cashflow' ||
                            activeTab === 'spending') && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Quick Presets
                                </label>
                                <select
                                    onChange={(e) => {
                                        const days = parseInt(e.target.value);
                                        const endDate = new Date()
                                            .toISOString()
                                            .split('T')[0];
                                        const startDate = new Date(
                                            Date.now() -
                                                days * 24 * 60 * 60 * 1000
                                        )
                                            .toISOString()
                                            .split('T')[0];
                                        setFilters((prev) => ({
                                            ...prev,
                                            startDate,
                                            endDate,
                                        }));
                                    }}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                >
                                    <option value="">Custom Range</option>
                                    <option value="7">Last 7 Days</option>
                                    <option value="30">Last 30 Days</option>
                                    <option value="90">Last 90 Days</option>
                                    <option value="365">Last Year</option>
                                </select>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    };

    const renderHoldingsTable = () => {
        type HoldingRow = TableRowBase & {
            asset?: string;
            account?: string;
            quantity?: number | string;
            value_usd?: number | string;
            value_vnd?: number | string;
            percentage?: number | string;
            last_updated?: string;
            horizon?: string;
        };
        const rawHoldings = (data.holdings as HoldingRow[]) ?? [];
        const displayHoldings: HoldingRow[] = Array.isArray(rawHoldings)
            ? rawHoldings
            : [];

        const columns: TableColumn<HoldingRow>[] = [
            {
                key: 'vault_name',
                title: 'Vault',
                render: (_value, _col, row) => {
                    const horizon = row.horizon
                        ? ` [${String(row.horizon ?? '')}]`
                        : '';
                    const a = String((row.asset as string) ?? '');
                    const acc = String((row.account as string) ?? '');
                    return `${a} @ ${acc}${horizon}`;
                },
            },
            { key: 'asset', title: 'Asset' },
            { key: 'account', title: 'Account' },
            {
                key: 'quantity',
                title: 'Quantity',
                type: 'number',
                render: (value) => {
                    const val = value as number | string | undefined;
                    return parseFloat(String(val ?? 0)).toLocaleString();
                },
            },
            {
                key: currency === 'USD' ? 'value_usd' : 'value_vnd',
                title: `Value (${currency})`,
                type: 'currency',
                currency: currency,
                render: (value) => {
                    const val = value as number | string | undefined;
                    const num = parseFloat(String(val ?? 0));
                    return currency === 'USD'
                        ? `$${num.toLocaleString()}`
                        : `₫${num.toLocaleString()}`;
                },
            },
            {
                key: 'percentage',
                title: 'Portfolio %',
                type: 'percentage',
                render: (value) => {
                    const val = value as number | string | undefined;
                    return `${parseFloat(String(val ?? 0)).toFixed(2)}%`;
                },
            },
            {
                key: 'last_updated',
                title: 'Last Updated',
                type: 'date',
                render: (value) =>
                    new Date(
                        String((value as string) ?? '')
                    ).toLocaleDateString(),
            },
        ];

        return (
            <DataTable
                data={displayHoldings}
                columns={columns}
                loading={loading}
                emptyMessage="No holdings found"
                filterable={true}
                sortable={true}
                pagination={true}
                onRowClick={(row) => {
                    if (row?.id) {
                        navigate(
                            `/vault/${encodeURIComponent(String(row.id))}`
                        );
                    }
                }}
            />
        );
    };

    const renderAssetAllocation = () => {
        const allocationData =
            (data.allocation as {
                by_asset?: Record<
                    string,
                    { value_usd?: number | string; value_vnd?: number | string }
                >;
            }) ?? {};

        if (
            !allocationData.by_asset ||
            Object.keys(allocationData.by_asset).length === 0
        ) {
            return (
                <div className="text-center py-8 text-gray-500">
                    No asset allocation data available
                </div>
            );
        }

        const allocData = allocationData as {
            by_asset: Record<
                string,
                {
                    quantity: number;
                    value_usd?: number;
                    value_vnd?: number;
                    percentage: number;
                }
            >;
            total_value_usd?: number;
            total_value_vnd?: number;
        };
        return <AssetAllocationChart data={allocData} currency={currency} />;
    };

    const renderInvestmentsTable = () => {
        // Investments tab removed
        return (
            <div className="text-center py-8 text-gray-500">
                Investments tab has been removed
            </div>
        );
    };

    const renderCashFlowTable = () => {
        type CashFlowData = {
            combined_in_usd?: number;
            combined_in_vnd?: number;
            combined_out_usd?: number;
            combined_out_vnd?: number;
            combined_net_usd?: number;
            combined_net_vnd?: number;
            total_in_usd?: number;
            total_out_usd?: number;
            net_usd?: number;
            total_in_vnd?: number;
            total_out_vnd?: number;
            net_vnd?: number;
            operating_in_usd?: number;
            operating_in_vnd?: number;
            operating_out_usd?: number;
            operating_out_vnd?: number;
            operating_net_usd?: number;
            operating_net_vnd?: number;
            financing_in_usd?: number;
            financing_in_vnd?: number;
            financing_out_usd?: number;
            financing_out_vnd?: number;
            financing_net_usd?: number;
            financing_net_vnd?: number;
            by_type?: Record<
                string,
                {
                    inflow_usd?: number;
                    outflow_usd?: number;
                    net_usd?: number;
                    inflow_vnd?: number;
                    outflow_vnd?: number;
                    net_vnd?: number;
                    count?: number;
                }
            >;
        };
        const rawCashFlow = (data.cashflow as CashFlowData) ?? {};
        const cashFlow: CashFlowData =
            typeof rawCashFlow === 'object' ? rawCashFlow : {};
        const rawPredicted =
            (data.predicted_outflows as PredictedOutflowsData) ?? null;
        const predictedOutflows: PredictedOutflowsData | null =
            rawPredicted && typeof rawPredicted === 'object'
                ? rawPredicted
                : null;
        type CashRow = TableRowBase & {
            type: string;
            inflow_usd?: number | string;
            outflow_usd?: number | string;
            net_usd?: number | string;
            inflow_vnd?: number | string;
            outflow_vnd?: number | string;
            net_vnd?: number | string;
            count?: number;
            [key: string]: unknown;
        };
        const byTypeObj =
            (cashFlow.by_type as Record<string, Record<string, unknown>>) ?? {};
        const byTypeEntries = Object.entries(byTypeObj);
        let allRows: CashRow[] = byTypeEntries.map(
            ([type, d]) => ({ type, ...d }) as CashRow
        );

        // For borrow, inflow is tracked in amount fields not cashflow; override so the row reflects real inflow
        allRows = allRows.map((row) => {
            if (row.type === 'borrow') {
                const inflowUSD = parseFloat(
                    String(cashFlow.financing_in_usd ?? 0)
                );
                const inflowVND = parseFloat(
                    String(cashFlow.financing_in_vnd ?? 0)
                );
                return {
                    ...row,
                    inflow_usd: inflowUSD,
                    inflow_vnd: inflowVND,
                    // keep existing outflow fields as-is; net will be computed from dataset columns in UI
                } as CashRow;
            }
            return row;
        });

        // Split into Operating vs Financing rows
        const financingTypes = new Set([
            'borrow',
            'repay_borrow',
            'interest_expense',
        ]);
        const financingRows: CashRow[] = allRows.filter((r: CashRow) =>
            financingTypes.has(r.type)
        );
        const operatingRows: CashRow[] = allRows.filter(
            (r: CashRow) => !financingTypes.has(r.type)
        );

        // Helper to compute section subtotals based on current currency
        const computeTotals = (rows: CashRow[]) => {
            const keyIn = currency === 'USD' ? 'inflow_usd' : 'inflow_vnd';
            const keyOut = currency === 'USD' ? 'outflow_usd' : 'outflow_vnd';
            const keyNet = currency === 'USD' ? 'net_usd' : 'net_vnd';
            const totals = rows.reduce(
                (
                    acc: {
                        inflow: number;
                        outflow: number;
                        net: number;
                        count: number;
                    },
                    r: CashRow
                ) => ({
                    inflow:
                        acc.inflow +
                        parseFloat(
                            String(
                                (r[keyIn as keyof CashRow] as
                                    | number
                                    | string) ?? 0
                            )
                        ),
                    outflow:
                        acc.outflow +
                        parseFloat(
                            String(
                                (r[keyOut as keyof CashRow] as
                                    | number
                                    | string) ?? 0
                            )
                        ),
                    net:
                        acc.net +
                        parseFloat(
                            String(
                                (r[keyNet as keyof CashRow] as
                                    | number
                                    | string) ?? 0
                            )
                        ),
                    count: acc.count + ((r.count as number) ?? 0),
                }),
                { inflow: 0, outflow: 0, net: 0, count: 0 }
            );
            return totals;
        };

        const columns: TableColumn<CashRow>[] = [
            { key: 'type', title: 'Transaction Type' },
            {
                key: currency === 'USD' ? 'inflow_usd' : 'inflow_vnd',
                title: `Inflow (${currency})`,
                type: 'currency',
                render: (value) => {
                    const val = value as number | string | undefined;
                    const num = parseFloat(String(val ?? 0));
                    return currency === 'USD'
                        ? `$${num.toLocaleString()}`
                        : `₫${num.toLocaleString()}`;
                },
            },
            {
                key: currency === 'USD' ? 'outflow_usd' : 'outflow_vnd',
                title: `Outflow (${currency})`,
                type: 'currency',
                render: (value) => {
                    const val = value as number | string | undefined;
                    const num = parseFloat(String(val ?? 0));
                    return currency === 'USD'
                        ? `$${num.toLocaleString()}`
                        : `₫${num.toLocaleString()}`;
                },
            },
            {
                key: currency === 'USD' ? 'net_usd' : 'net_vnd',
                title: `Net (${currency})`,
                type: 'currency',
                render: (value) => {
                    const val = value as number | string | undefined;
                    const num = parseFloat(String(val ?? 0));
                    const formatted =
                        currency === 'USD'
                            ? `$${Math.abs(num).toLocaleString()}`
                            : `₫${Math.abs(num).toLocaleString()}`;
                    return num >= 0 ? `+${formatted}` : `-${formatted}`;
                },
            },
            {
                key: 'count',
                title: 'Transactions',
                type: 'number',
            },
        ];

        return (
            <div>
                <PredictedOutflowsModule
                    data={predictedOutflows}
                    currency={currency}
                />
                {/* Enhanced Cash Flow Chart */}
                <CashFlowChart data={cashFlow} currency={currency} />

                {/* Summary Stats - Combined */}
                {cashFlow.total_in_usd !== undefined && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <Card className="bg-green-50 border-green-200">
                            <CardContent className="p-4">
                                <h4 className="text-sm font-medium text-green-800">
                                    Combined Inflow
                                </h4>
                                <p className="text-2xl font-bold text-green-900">
                                    {currency === 'USD'
                                        ? `$${parseFloat(String(cashFlow.combined_in_usd ?? cashFlow.total_in_usd ?? 0)).toLocaleString()}`
                                        : `₫${parseFloat(String(cashFlow.combined_in_vnd ?? cashFlow.total_in_vnd ?? 0)).toLocaleString()}`}
                                </p>
                            </CardContent>
                        </Card>
                        <Card className="bg-red-50 border-red-200">
                            <CardContent className="p-4">
                                <h4 className="text-sm font-medium text-red-800">
                                    Combined Outflow
                                </h4>
                                <p className="text-2xl font-bold text-red-900">
                                    {currency === 'USD'
                                        ? `$${parseFloat(String(cashFlow.combined_out_usd ?? cashFlow.total_out_usd ?? 0)).toLocaleString()}`
                                        : `₫${parseFloat(String(cashFlow.combined_out_vnd ?? cashFlow.total_out_vnd ?? 0)).toLocaleString()}`}
                                </p>
                            </CardContent>
                        </Card>
                        <Card className="bg-blue-50 border-blue-200">
                            <CardContent className="p-4">
                                <h4 className="text-sm font-medium text-blue-800">
                                    Combined Net
                                </h4>
                                <p className="text-2xl font-bold text-blue-900">
                                    {currency === 'USD'
                                        ? `$${parseFloat(String(cashFlow.combined_net_usd ?? cashFlow.net_usd ?? 0)).toLocaleString()}`
                                        : `₫${parseFloat(String(cashFlow.combined_net_vnd ?? cashFlow.net_vnd ?? 0)).toLocaleString()}`}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Secondary: Operating vs Financing */}
                {cashFlow.operating_in_usd !== undefined && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <Card className="bg-gray-50">
                            <CardContent className="p-4">
                                <h4 className="text-sm font-medium text-gray-800 mb-2">
                                    Operating
                                </h4>
                                <div className="flex items-center justify-between text-sm">
                                    <span>Inflow</span>
                                    <span>
                                        {currency === 'USD'
                                            ? `$${parseFloat(String(cashFlow.operating_in_usd ?? 0)).toLocaleString()}`
                                            : `₫${parseFloat(String(cashFlow.operating_in_vnd ?? 0)).toLocaleString()}`}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span>Outflow</span>
                                    <span>
                                        {currency === 'USD'
                                            ? `$${parseFloat(String(cashFlow.operating_out_usd ?? 0)).toLocaleString()}`
                                            : `₫${parseFloat(String(cashFlow.operating_out_vnd ?? 0)).toLocaleString()}`}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between font-semibold">
                                    <span>Net</span>
                                    <span>
                                        {currency === 'USD'
                                            ? `$${parseFloat(String(cashFlow.operating_net_usd ?? 0)).toLocaleString()}`
                                            : `₫${parseFloat(String(cashFlow.operating_net_vnd ?? 0)).toLocaleString()}`}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-gray-50">
                            <CardContent className="p-4">
                                <h4 className="text-sm font-medium text-gray-800 mb-2">
                                    Financing
                                </h4>
                                <div className="flex items-center justify-between text-sm">
                                    <span>Inflow (Borrow)</span>
                                    <span>
                                        {currency === 'USD'
                                            ? `$${parseFloat(String(cashFlow.financing_in_usd ?? 0)).toLocaleString()}`
                                            : `₫${parseFloat(String(cashFlow.financing_in_vnd ?? 0)).toLocaleString()}`}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span>Outflow (Repay + Interest)</span>
                                    <span>
                                        {currency === 'USD'
                                            ? `$${parseFloat(String(cashFlow.financing_out_usd ?? 0)).toLocaleString()}`
                                            : `₫${parseFloat(String(cashFlow.financing_out_vnd ?? 0)).toLocaleString()}`}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between font-semibold">
                                    <span>Net</span>
                                    <span>
                                        {currency === 'USD'
                                            ? `$${parseFloat(String(cashFlow.financing_net_usd ?? 0)).toLocaleString()}`
                                            : `₫${parseFloat(String(cashFlow.financing_net_vnd ?? 0)).toLocaleString()}`}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Operating section */}
                <div className="space-y-2 mb-8">
                    <div className="flex items-center justify-between">
                        <h4 className="text-md font-semibold text-gray-900">
                            Operating Cash Flows
                        </h4>
                        {operatingRows.length > 0 &&
                            (() => {
                                const t = computeTotals(operatingRows);
                                const fmt = (n: number) =>
                                    currency === 'USD'
                                        ? `$${Math.abs(n).toLocaleString()}`
                                        : `₫${Math.abs(n).toLocaleString()}`;
                                return (
                                    <div className="text-sm text-gray-700 flex items-center gap-4">
                                        <span>In: {fmt(t.inflow)}</span>
                                        <span>Out: {fmt(t.outflow)}</span>
                                        <span>
                                            Net: {t.net >= 0 ? '+' : '-'}
                                            {fmt(t.net)}
                                        </span>
                                        <span>Tx: {t.count}</span>
                                    </div>
                                );
                            })()}
                    </div>
                    <DataTable
                        data={operatingRows}
                        columns={columns}
                        loading={loading}
                        emptyMessage="No operating cash flows"
                        filterable={true}
                        sortable={true}
                        pagination={true}
                    />
                </div>

                {/* Financing section */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-md font-semibold text-gray-900">
                            Financing Cash Flows
                        </h4>
                        {financingRows.length > 0 &&
                            (() => {
                                const t = computeTotals(financingRows);
                                const fmt = (n: number) =>
                                    currency === 'USD'
                                        ? `$${Math.abs(n).toLocaleString()}`
                                        : `₫${Math.abs(n).toLocaleString()}`;
                                return (
                                    <div className="text-sm text-gray-700 flex items-center gap-4">
                                        <span>In: {fmt(t.inflow)}</span>
                                        <span>Out: {fmt(t.outflow)}</span>
                                        <span>
                                            Net: {t.net >= 0 ? '+' : '-'}
                                            {fmt(t.net)}
                                        </span>
                                        <span>Tx: {t.count}</span>
                                    </div>
                                );
                            })()}
                    </div>
                    <DataTable
                        data={financingRows}
                        columns={columns}
                        loading={loading}
                        emptyMessage="No financing cash flows"
                        filterable={true}
                        sortable={true}
                        pagination={true}
                    />
                </div>
            </div>
        );
    };

    const renderSpendingTable = () => {
        const rawSpending = (data.spending as Record<string, unknown>) ?? {};
        const spending = typeof rawSpending === 'object' ? rawSpending : {};
        const byTag = Object.entries(
            (spending.by_tag as Record<string, unknown>) ?? {}
        ).map(([tag, d]) => ({
            tag,
            ...(d as Record<string, unknown>),
        })) as SpendingRow[];

        type SpendingRow = TableRowBase & {
            tag: string;
            amount_usd?: number | string;
            amount_vnd?: number | string;
            percentage?: number | string;
            count?: number;
        };
        const columns: TableColumn<SpendingRow>[] = [
            { key: 'tag', title: 'Category' },
            {
                key: currency === 'USD' ? 'amount_usd' : 'amount_vnd',
                title: `Amount (${currency})`,
                type: 'currency',
                render: (value) => {
                    const val = value as number | string | undefined;
                    const num = parseFloat(String(val ?? 0));
                    return currency === 'USD'
                        ? `$${num.toLocaleString()}`
                        : `₫${num.toLocaleString()}`;
                },
            },
            {
                key: 'percentage',
                title: '% of Total',
                render: (value) => {
                    const val = value as number | string | undefined;
                    const pct = parseFloat(String(val ?? 0));
                    return (
                        <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-orange-500 h-2 rounded-full"
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                            </div>
                            <span>{pct.toFixed(1)}%</span>
                        </div>
                    );
                },
            },
            {
                key: 'count',
                title: 'Transactions',
                type: 'number',
            },
        ];

        // Extract spending metrics
        const currentMonthUsd = Number(spending.current_month_usd ?? 0);
        const currentMonthVnd = Number(spending.current_month_vnd ?? 0);
        const lastMonthUsd = Number(spending.last_month_usd ?? 0);
        const lastMonthVnd = Number(spending.last_month_vnd ?? 0);
        const momChangePercent = Number(spending.mom_change_percent ?? 0);
        const avgDailyUsd = Number(spending.avg_daily_usd ?? 0);
        const avgDailyVnd = Number(spending.avg_daily_vnd ?? 0);
        const availableBalanceUsd = Number(spending.available_balance_usd ?? 0);
        const availableBalanceVnd = Number(spending.available_balance_vnd ?? 0);
        const totalUsd = Number(spending.total_usd ?? 0);
        const totalVnd = Number(spending.total_vnd ?? 0);

        const currentMonth =
            currency === 'USD' ? currentMonthUsd : currentMonthVnd;
        const lastMonth = currency === 'USD' ? lastMonthUsd : lastMonthVnd;
        const avgDaily = currency === 'USD' ? avgDailyUsd : avgDailyVnd;
        const availableBalance =
            currency === 'USD' ? availableBalanceUsd : availableBalanceVnd;
        const total = currency === 'USD' ? totalUsd : totalVnd;
        const currencySymbol = currency === 'USD' ? '$' : '₫';

        // Get current month name
        const currentMonthName = new Date().toLocaleString('default', {
            month: 'long',
        });

        return (
            <div className="space-y-6">
                {/* Key Metrics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Available Balance */}
                    <Card
                        className={`border-2 ${availableBalance >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
                    >
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-1">
                                <h4
                                    className={`text-sm font-medium ${availableBalance >= 0 ? 'text-green-800' : 'text-red-800'}`}
                                >
                                    Available Balance
                                </h4>
                                <span className="text-lg">
                                    {availableBalance >= 0 ? '💰' : '⚠️'}
                                </span>
                            </div>
                            <p
                                className={`text-2xl font-bold ${availableBalance >= 0 ? 'text-green-900' : 'text-red-900'}`}
                            >
                                {currencySymbol}
                                {Math.abs(availableBalance).toLocaleString(
                                    undefined,
                                    { maximumFractionDigits: 0 }
                                )}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                                Income - Expenses
                            </p>
                        </CardContent>
                    </Card>

                    {/* Current Month Spending */}
                    <Card className="bg-orange-50 border-2 border-orange-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className="text-sm font-medium text-orange-800">
                                    {currentMonthName} Spending
                                </h4>
                                <span className="text-lg">📊</span>
                            </div>
                            <p className="text-2xl font-bold text-orange-900">
                                {currencySymbol}
                                {currentMonth.toLocaleString(undefined, {
                                    maximumFractionDigits: 0,
                                })}
                            </p>
                            {lastMonth > 0 && (
                                <div className="flex items-center mt-1">
                                    <span
                                        className={`text-xs font-medium ${momChangePercent <= 0 ? 'text-green-600' : 'text-red-600'}`}
                                    >
                                        {momChangePercent <= 0 ? '↓' : '↑'}{' '}
                                        {Math.abs(momChangePercent).toFixed(1)}%
                                        vs last month
                                    </span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Daily Average */}
                    <Card className="bg-blue-50 border-2 border-blue-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className="text-sm font-medium text-blue-800">
                                    Daily Average
                                </h4>
                                <span className="text-lg">📅</span>
                            </div>
                            <p className="text-2xl font-bold text-blue-900">
                                {currencySymbol}
                                {avgDaily.toLocaleString(undefined, {
                                    maximumFractionDigits: 0,
                                })}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                                This month so far
                            </p>
                        </CardContent>
                    </Card>

                    {/* Period Total */}
                    <Card className="bg-purple-50 border-2 border-purple-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className="text-sm font-medium text-purple-800">
                                    Period Total
                                </h4>
                                <span className="text-lg">🛒</span>
                            </div>
                            <p className="text-2xl font-bold text-purple-900">
                                {currencySymbol}
                                {total.toLocaleString(undefined, {
                                    maximumFractionDigits: 0,
                                })}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                                Selected date range
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Month Comparison Card */}
                {(currentMonth > 0 || lastMonth > 0) && (
                    <Card>
                        <CardContent className="p-4">
                            <h4 className="text-sm font-medium text-gray-700 mb-3">
                                Month-over-Month Comparison
                            </h4>
                            <div className="flex items-center gap-8">
                                <div className="flex-1">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-600">
                                            Current Month
                                        </span>
                                        <span className="font-medium text-orange-600">
                                            {currencySymbol}
                                            {currentMonth.toLocaleString(
                                                undefined,
                                                { maximumFractionDigits: 0 }
                                            )}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-3">
                                        <div
                                            className="bg-orange-500 h-3 rounded-full transition-all duration-500"
                                            style={{
                                                width: `${Math.min((currentMonth / Math.max(currentMonth, lastMonth)) * 100, 100)}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-600">
                                            Last Month
                                        </span>
                                        <span className="font-medium text-gray-600">
                                            {currencySymbol}
                                            {lastMonth.toLocaleString(
                                                undefined,
                                                { maximumFractionDigits: 0 }
                                            )}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-3">
                                        <div
                                            className="bg-gray-400 h-3 rounded-full transition-all duration-500"
                                            style={{
                                                width: `${Math.min((lastMonth / Math.max(currentMonth, lastMonth)) * 100, 100)}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="text-center px-4 py-2 rounded-lg bg-gray-50">
                                    <div
                                        className={`text-lg font-bold ${momChangePercent <= 0 ? 'text-green-600' : 'text-red-600'}`}
                                    >
                                        {momChangePercent <= 0 ? '↓' : '↑'}{' '}
                                        {Math.abs(momChangePercent).toFixed(1)}%
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Change
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Charts Section */}
                {spending.total_usd !== undefined && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Monthly Spending Trend */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">
                                    Monthly Spending Trend (12 months)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div style={{ height: '300px' }}>
                                    <MonthlySpendingTrendChart
                                        data={
                                            spending as {
                                                monthly_trend?: Array<{
                                                    month: string;
                                                    amount_usd: number;
                                                    amount_vnd: number;
                                                }>;
                                            }
                                        }
                                        currency={currency}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Spending by Category */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">
                                    Spending by Category
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div style={{ height: '300px' }}>
                                    <SpendingChart
                                        data={spending}
                                        currency={currency}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Daily Spending Chart - Full Width */}
                {spending.total_usd !== undefined && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">
                                Daily Spending (Selected Period)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ height: '250px' }}>
                                <DailySpendingChart
                                    data={spending}
                                    currency={currency}
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Category Breakdown Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Spending by Category</CardTitle>
                        <p className="text-sm text-gray-500 mt-1">
                            Hover over categories to see top expenses • Click to view all
                        </p>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-center py-8 text-gray-500">
                                Loading...
                            </div>
                        ) : byTag.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                No spending data found
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Category
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Amount ({currency})
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                % of Total
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Transactions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {byTag.map((row) => (
                                            <CategoryRow
                                                key={row.tag}
                                                tag={row.tag}
                                                amount={parseFloat(
                                                    String(
                                                        currency === 'USD'
                                                            ? row.amount_usd
                                                            : row.amount_vnd ?? 0
                                                    )
                                                )}
                                                percentage={parseFloat(
                                                    String(row.percentage ?? 0)
                                                )}
                                                count={row.count ?? 0}
                                                transactions={
                                                    (row as any).transactions ?? []
                                                }
                                                currency={currency}
                                                currencySymbol={currencySymbol}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    };

    const _renderPnLTable = () => {
        const rawPnl = (data.pnl as Record<string, unknown>) ?? {};
        const pnl = typeof rawPnl === 'object' ? rawPnl : {};
        const realizedPnL = parseFloat(
            String(
                currency === 'USD'
                    ? ((pnl.realized_pnl_usd as number) ?? 0)
                    : ((pnl.realized_pnl_vnd as number) ?? 0)
            )
        );
        // Unrealized removed
        const totalPnL = parseFloat(
            String(
                currency === 'USD'
                    ? ((pnl.total_pnl_usd as number) ?? 0)
                    : ((pnl.total_pnl_vnd as number) ?? 0)
            )
        );

        // Prepare by-asset breakdown (USD values as backend provides USD per asset)
        const byAssetEntries = Object.entries(
            (pnl.by_asset as Record<string, unknown>) ?? {}
        ).map(([asset, rec]) => ({
            asset,
            realized_usd: parseFloat(
                String(
                    ((rec as Record<string, unknown>)
                        .realized_pnl_usd as number) ?? 0
                )
            ),
            total_usd: parseFloat(
                String(
                    ((rec as Record<string, unknown>)
                        .total_pnl_usd as number) ?? 0
                )
            ),
        })) as Array<{
            asset: string;
            realized_usd: number;
            total_usd: number;
        }>;
        const assetColumns: TableColumn<{
            asset: string;
            realized_usd: number;
            total_usd: number;
        }>[] = [
            { key: 'asset', title: 'Asset' },
            {
                key: 'realized_usd',
                title: 'Realized P&L (USD)',
                type: 'currency',
                render: (value) => {
                    const val = value as number | string | undefined;
                    const num = parseFloat(String(val ?? 0));
                    const formatted = `$${Math.abs(num).toLocaleString()}`;
                    return num >= 0 ? `+${formatted}` : `-${formatted}`;
                },
            },
            {
                key: 'total_usd',
                title: 'Total P&L (USD)',
                type: 'currency',
                render: (value) => {
                    const val = value as number | string | undefined;
                    const num = parseFloat(String(val ?? 0));
                    const formatted = `$${Math.abs(num).toLocaleString()}`;
                    return num >= 0 ? `+${formatted}` : `-${formatted}`;
                },
            },
        ];

        return (
            <div>
                {/* P&L Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card
                        className={
                            realizedPnL >= 0 ? 'bg-green-50' : 'bg-red-50'
                        }
                        data-testid="pnl-value"
                    >
                        <CardContent className="p-4">
                            <h4
                                className={`text-sm font-medium ${realizedPnL >= 0 ? 'text-green-800' : 'text-red-800'}`}
                            >
                                Realized P&L
                            </h4>
                            <p
                                className={`text-2xl font-bold ${realizedPnL >= 0 ? 'text-green-900' : 'text-red-900'}`}
                            >
                                {currency === 'USD'
                                    ? `$${Math.abs(realizedPnL).toLocaleString()}`
                                    : `₫${Math.abs(realizedPnL).toLocaleString()}`}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                                Gains/losses from closed positions
                            </p>
                        </CardContent>
                    </Card>
                    {/* Unrealized P&L removed */}
                    <Card
                        className={
                            totalPnL >= 0 ? 'bg-purple-50' : 'bg-red-100'
                        }
                    >
                        <CardContent className="p-4">
                            <h4
                                className={`text-sm font-medium ${totalPnL >= 0 ? 'text-purple-800' : 'text-red-800'}`}
                            >
                                Total P&L
                            </h4>
                            <p
                                className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-purple-900' : 'text-red-900'}`}
                            >
                                {currency === 'USD'
                                    ? `$${Math.abs(totalPnL).toLocaleString()}`
                                    : `₫${Math.abs(totalPnL).toLocaleString()}`}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                                Total investment performance
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* P&L Chart and Additional Metrics */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* P&L Chart */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">
                                P&L Breakdown
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ height: '300px' }}>
                                <PnLChart data={pnl} currency={currency} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Detailed Metrics */}
                    <div className="space-y-4">
                        {pnl.roi_percent !== undefined && (
                            <Card className="bg-gray-50">
                                <CardContent className="p-4">
                                    <h4 className="text-sm font-medium text-gray-800">
                                        Return on Investment (ROI)
                                    </h4>
                                    <p
                                        className={`text-xl font-bold ${parseFloat(String((pnl.roi_percent as number) ?? 0)) >= 0 ? 'text-green-900' : 'text-red-900'}`}
                                    >
                                        {parseFloat(
                                            String(
                                                (pnl.roi_percent as number) ?? 0
                                            )
                                        ).toFixed(2)}
                                        %
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">
                                        Percentage return on invested capital
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        {/* P&L Breakdown Summary */}
                        <Card>
                            <CardContent className="p-4">
                                <h4 className="text-sm font-medium text-gray-800 mb-2">
                                    P&L Summary
                                </h4>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-600">
                                            Realized
                                        </span>
                                        <span
                                            className={`text-sm font-medium ${realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                        >
                                            {currency === 'USD'
                                                ? `$${Math.abs(realizedPnL).toLocaleString()}`
                                                : `₫${Math.abs(realizedPnL).toLocaleString()}`}
                                        </span>
                                    </div>
                                    {/* Unrealized removed */}
                                    <div className="pt-2 mt-2 border-t border-gray-200">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-gray-900">
                                                Total
                                            </span>
                                            <span
                                                className={`text-sm font-bold ${totalPnL >= 0 ? 'text-purple-600' : 'text-red-700'}`}
                                            >
                                                {currency === 'USD'
                                                    ? `$${Math.abs(totalPnL).toLocaleString()}`
                                                    : `₫${Math.abs(totalPnL).toLocaleString()}`}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* By-Asset Breakdown (USD) */}
                        <Card>
                            <CardContent className="p-4">
                                <h4 className="text-sm font-medium text-gray-800 mb-2">
                                    By Asset (USD)
                                </h4>
                                <DataTable
                                    data={byAssetEntries}
                                    columns={assetColumns}
                                    loading={loading}
                                    emptyMessage="No asset P&L data"
                                    filterable={true}
                                    sortable={true}
                                    pagination={true}
                                />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        if (!isOnline) {
            return (
                <Card className="bg-orange-50 border-orange-200">
                    <CardContent className="p-4 text-center">
                        <p className="text-orange-800">
                            Backend is offline. Please check your connection.
                        </p>
                    </CardContent>
                </Card>
            );
        }

        if (error) {
            return (
                <Card className="bg-red-50 border-red-200">
                    <CardContent className="p-4 text-center">
                        <p className="text-red-800">{error}</p>
                        <Button
                            onClick={() => {
                                void fetchData();
                            }}
                            variant="destructive"
                            className="mt-2"
                        >
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            );
        }

        switch (activeTab) {
            case 'holdings':
                return renderHoldingsTable();
            case 'allocation':
                return renderAssetAllocation();
            case 'investments':
                return renderInvestmentsTable();
            case 'cashflow':
                return renderCashFlowTable();
            case 'spending':
                return renderSpendingTable();
            default:
                return <div>Select a report type</div>;
        }
    };

	    return (
	        <div className="px-4 py-6 sm:px-0">
	            <div className="mb-6">
	                <h1
	                    className="text-2xl font-bold text-gray-900"
	                    data-testid="reports-page-title"
	                >
	                    {pageTitle}
	                </h1>
	                {pageDescription ? (
	                    <p className="mt-1 text-sm text-gray-500">
	                        {pageDescription}
	                    </p>
	                ) : null}
	            </div>

	            {/* Tabs */}
	            {showTabBar ? (
	                <div className="border-b border-gray-200 mb-6">
	                    <nav className="-mb-px flex space-x-8">
	                        {tabs.map((tab) => (
	                            <Button
	                                key={tab.id}
	                                onClick={() => setActiveTab(tab.id)}
	                                variant="ghost"
	                                className={`${
	                                    activeTab === tab.id
	                                        ? 'border-blue-500 text-blue-600 border-b-2'
	                                        : 'border-transparent text-gray-500 hover:text-gray-700'
	                                } whitespace-nowrap py-2 px-1 font-medium text-sm flex items-center space-x-2 rounded-none`}
	                                data-testid={`reports-tab-${tab.id}`}
	                            >
	                                <span>{tab.icon}</span>
	                                <span>{tab.name}</span>
	                            </Button>
	                        ))}
	                    </nav>
	                </div>
	            ) : null}

	            {/* Filters */}
	            {renderFilters()}

            {/* Content */}
            <Card>
	                <CardHeader>
	                    <CardTitle
	                        data-testid={`reports-section-title-${activeTab}`}
	                    >
	                        {showTabBar
	                            ? `${activeTabName ?? 'Report'} Report`
	                            : activeTabName ?? 'Report'}
	                    </CardTitle>
	                </CardHeader>
	                <CardContent>{renderContent()}</CardContent>
	            </Card>
	        </div>
    );
};

export default ReportsPage;
