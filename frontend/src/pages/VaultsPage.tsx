import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// eslint-disable-next-line import/no-named-as-default
import AUMChart from '../components/reports/AUMChart';
import { TimeSeriesLineChart } from '../components/reports/Charts';
import CreateTokenizedVaultForm from '../components/tokenized/CreateTokenizedVaultForm';
import DataTable, { TableColumn } from '../components/ui/DataTable';
import { useToast } from '../components/ui/Toast';
import { tokenizedVaultApi, ApiError, reportsApi } from '../services/api';
import { formatCurrency, formatPercentage } from '../utils/currencyFormatter';

type TimeRange = '7d' | '30d' | 'all';

type TokenizedVault = {
    id: string;
    name: string;
    description?: string;
    type: string;
    status: string;
    token_symbol: string;
    token_decimals: number;
    total_supply: string;
    total_assets_under_management: string;
    current_share_price: string;
    initial_share_price: string;
    is_user_defined_price: boolean;
    manual_price_per_share: string;
    price_last_updated_by?: string;
    price_last_updated_at?: string;
    price_update_notes?: string;
    inception_date: string;
    last_updated: string;
    performance_since_inception: string;
    apr_percent?: string | number; // backend APR since inception
    created_by: string;
    created_at: string;
    updated_at: string;
};

const VaultsPage: React.FC = () => {
    const navigate = useNavigate();
    const { error: showErrorToast, success: showSuccessToast } = useToast();
    const shouldToast = (e: unknown) =>
        !(e instanceof ApiError && e.status === 0);

    const [vaults, setVaults] = useState<TokenizedVault[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
    const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('active');

    // Unified time range for all charts
    const [timeRange, setTimeRange] = useState<TimeRange>('30d');

    // Aggregate time series data for PNL chart
    const [pnlSeriesFull, setPnlSeriesFull] = useState<
        Array<{ date: string; total_pnl_usd: number }>
    >([]);

    // Aggregate time series data for APR chart
    const [aprSeriesFull, setAprSeriesFull] = useState<
        Array<{
            date: string;
            weighted_apr_percent: number;
            weighted_roi_percent: number;
        }>
    >([]);

    const investableVaults = useMemo(() => {
        return vaults.filter(
            (v) => !['spend', 'borrowings'].includes(v.name.toLowerCase())
        );
    }, [vaults]);

    const investableVaultIds = useMemo(() => {
        return investableVaults.map((v) => v.id);
    }, [investableVaults]);

    const loadVaults = useCallback(async (): Promise<void> => {
        try {
            setLoading(true);
            // Fetch tokenized vaults and backend APR summary in parallel
            const [vaultsData, summary] = await Promise.all([
                tokenizedVaultApi.list<TokenizedVault[]>(),
                reportsApi.vaultsSummary<{
                    rows: Array<{
                        vault: string;
                        apr_percent: number;
                        aum_usd: number;
                    }>;
                }>(),
            ]);
            const mapAPR = new Map<string, number>();
            type SummaryRow = { vault: string; apr_percent: number };
            const rows = (summary as { rows?: SummaryRow[] } | null)?.rows;
            if (Array.isArray(rows)) {
                for (const r of rows)
                    mapAPR.set(r.vault, Number(r.apr_percent) || 0);
            }
            const vts = (vaultsData ?? []).map((v: TokenizedVault) => ({
                ...v,
                apr_percent: mapAPR.get(v.id),
            }));
            setVaults(vts);
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Failed to load vaults';
            setError(message);
            if (shouldToast(err)) showErrorToast('Failed to load vaults');
        } finally {
            setLoading(false);
        }
    }, [showErrorToast]);

    useEffect(() => {
        void loadVaults();
    }, [filter, loadVaults]);

    // Helper function to calculate date range based on time range
    const getDateRange = useCallback((timeRange: TimeRange) => {
        const now = new Date();
        const endDate = now.toISOString().split('T')[0];
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

        return { start: startDate, end: endDate };
    }, []);

    // Filter data to show only from max(first data date, T-7d/T-30d)
    const filterDataByTimeRange = useCallback(
        <T extends { date: string }>(data: T[], timeRange: TimeRange): T[] => {
            if (data.length === 0) return data;

            const { start } = getDateRange(timeRange);

            // Find the first date in the dataset
            const firstDataDate = data[0].date;

            // If 'all', show all data
            if (timeRange === 'all' || !start) {
                return data;
            }

            // Use whichever is later: first data date OR T-7d/T-30d
            const effectiveStartDate =
                firstDataDate > start ? firstDataDate : start;

            return data.filter((d) => d.date >= effectiveStartDate);
        },
        [getDateRange]
    );

    // Computed filtered data based on time range
    const pnlSeries = useMemo(
        () => filterDataByTimeRange(pnlSeriesFull, timeRange),
        [pnlSeriesFull, timeRange, filterDataByTimeRange]
    );
    const aprSeries = useMemo(
        () => filterDataByTimeRange(aprSeriesFull, timeRange),
        [aprSeriesFull, timeRange, filterDataByTimeRange]
    );

    // Load aggregate time series for charts (fetch all data, filter on frontend)
    useEffect(() => {
        const loadAggregateSeries = async () => {
            if (investableVaultIds.length === 0) {
                setPnlSeriesFull([]);
                setAprSeriesFull([]);
                return;
            }

            try {
                const params: Record<string, string> = {
                    end: new Date().toISOString().split('T')[0],
                    vaults: investableVaultIds.join(','),
                };

                const result = await reportsApi.series<{
                    account: string;
                    series: Array<{
                        date: string;
                        pnl_usd: number;
                        apr_percent: number;
                        roi_percent: number;
                    }>;
                }>(params);

                const series = result?.series ?? [];
                if (!Array.isArray(series) || series.length === 0) {
                    setPnlSeriesFull([]);
                    setAprSeriesFull([]);
                    return;
                }

                const earliestInception = investableVaults.reduce(
                    (earliest, vault) => {
                        const inceptionDate = new Date(vault.inception_date);
                        return !earliest || inceptionDate < earliest
                            ? inceptionDate
                            : earliest;
                    },
                    null as Date | null
                );

                const filteredSeries = earliestInception
                    ? series.filter(
                          (point) => new Date(point.date) >= earliestInception
                      )
                    : series;

                setPnlSeriesFull(
                    filteredSeries
                        .map((point) => ({
                            date: point.date,
                            total_pnl_usd: point.pnl_usd || 0,
                        }))
                        .sort((a, b) => a.date.localeCompare(b.date))
                );

                setAprSeriesFull(
                    filteredSeries
                        .map((point) => ({
                            date: point.date,
                            weighted_apr_percent: point.apr_percent || 0,
                            weighted_roi_percent: point.roi_percent || 0,
                        }))
                        .sort((a, b) => a.date.localeCompare(b.date))
                );
            } catch {
                setPnlSeriesFull([]);
                setAprSeriesFull([]);
            }
        };

        void loadAggregateSeries();
    }, [investableVaultIds, investableVaults]);

    const handleCreateVault = () => {
        setShowCreateForm(true);
    };

    const handleCloseVault = async (vault: TokenizedVault): Promise<void> => {
        if (
            !confirm(
                `Are you sure you want to close vault "${vault.name}"? This will mark it as closed but keep all data.`
            )
        ) {
            return;
        }

        try {
            await tokenizedVaultApi.close(vault.id);
            showSuccessToast('Vault closed successfully!');
            void loadVaults();
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Failed to close vault';
            showErrorToast(message);
        }
    };

    const handleDeleteVault = async (vault: TokenizedVault): Promise<void> => {
        if (
            !confirm(
                `Are you sure you want to delete vault "${vault.name}"? This action cannot be undone and will permanently remove all vault data.`
            )
        ) {
            return;
        }

        try {
            await tokenizedVaultApi.delete(vault.id);
            showSuccessToast('Vault deleted successfully!');
            void loadVaults();
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Failed to delete vault';
            showErrorToast(message);
        }
    };

    const handleViewVault = (vault: TokenizedVault): void => {
        navigate(`/vault/${vault.id}`);
    };

    const vaultColumns: TableColumn<TokenizedVault>[] = [
        {
            key: 'name',
            title: 'Vault Name',
            render: (value, _column, row) => (
                <div>
                    <Button
                        variant="link"
                        onClick={() => handleViewVault(row)}
                        className="p-0 h-auto font-medium text-left"
                    >
                        {value}
                    </Button>
                    <div className="text-sm text-gray-500">
                        {row.token_symbol}
                    </div>
                    {row.description && (
                        <div
                            className="text-xs text-gray-400 truncate max-w-xs"
                            title={row.description}
                        >
                            {row.description}
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: 'type',
            title: 'Type',
            render: (value, _c, row) => {
                const isSpend =
                    String(row.name || '').toLowerCase() === 'spend';
                const isBorrowings =
                    String(row.name || '').toLowerCase() === 'borrowings';
                if (isSpend) {
                    return (
                        <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800`}
                        >
                            Cash
                        </span>
                    );
                }
                if (isBorrowings) {
                    return (
                        <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800`}
                        >
                            Liability
                        </span>
                    );
                }
                const typeConfig = {
                    user_defined: {
                        label: 'User-Defined',
                        class: 'bg-purple-100 text-purple-800',
                    },
                    single_asset: {
                        label: 'Single Asset',
                        class: 'bg-blue-100 text-blue-800',
                    },
                    multi_asset: {
                        label: 'Multi-Asset',
                        class: 'bg-green-100 text-green-800',
                    },
                };
                const key = typeof value === 'string' ? value : '';
                const config = typeConfig[key as keyof typeof typeConfig] || {
                    label: key,
                    class: 'bg-gray-100 text-gray-800',
                };
                return (
                    <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.class}`}
                    >
                        {config.label}
                    </span>
                );
            },
        },
        {
            key: 'current_share_price',
            title: 'Token Price',
            type: 'currency',
            currency: 'USD',
            render: (value, _column, row) => {
                const isSpend =
                    String(row.name || '').toLowerCase() === 'spend';
                const isBorrowings =
                    String(row.name || '').toLowerCase() === 'borrowings';
                if (isSpend || isBorrowings) {
                    return <span className="text-gray-500">—</span>;
                }
                const price =
                    typeof value === 'string' && value !== ''
                        ? parseFloat(value)
                        : 0;
                const isManual = row.is_user_defined_price;
                return (
                    <div>
                        <div className="font-medium">${price.toFixed(4)}</div>
                        {isManual && (
                            <div className="text-xs text-orange-600">
                                Manual
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            key: 'total_assets_under_management',
            title: 'Total Value',
            type: 'currency',
            currency: 'USD',
            render: (value, _c, row) => {
                const num =
                    typeof value === 'string' && value !== ''
                        ? parseFloat(value)
                        : 0;
                const isBorrowings =
                    String(row.name || '').toLowerCase() === 'borrowings';
                const cls =
                    isBorrowings && num < 0 ? 'text-red-700 font-medium' : '';
                return <span className={cls}>{formatCurrency(num)}</span>;
            },
        },
        {
            key: 'performance_since_inception',
            title: 'Return Since Inception',
            type: 'number',
            decimals: 2,
            render: (_value, _c, row) => {
                const isSpend =
                    String(row.name || '').toLowerCase() === 'spend';
                const isBorrowings =
                    String(row.name || '').toLowerCase() === 'borrowings';
                if (isSpend || isBorrowings)
                    return <span className="text-gray-500">—</span>;
                const raw =
                    typeof row.performance_since_inception === 'string'
                        ? parseFloat(row.performance_since_inception)
                        : row.performance_since_inception;
                if (!(typeof raw === 'number' && isFinite(raw))) {
                    return <span className="text-gray-500">—</span>;
                }
                const isPositive = raw > 0;
                const className = isPositive
                    ? 'text-green-700'
                    : raw < 0
                      ? 'text-red-700'
                      : 'text-gray-700';
                return (
                    <span className={className}>
                        {formatPercentage(raw / 100, 2)}
                    </span>
                );
            },
        },
        {
            key: 'apr_percent',
            title: 'Est. APR (IRR)',
            type: 'number',
            decimals: 2,
            render: (_value, _c, row) => {
                const isSpend =
                    String(row.name || '').toLowerCase() === 'spend';
                const isBorrowings =
                    String(row.name || '').toLowerCase() === 'borrowings';
                if (isSpend || isBorrowings)
                    return <span className="text-gray-500">—</span>;
                const raw =
                    typeof row.apr_percent === 'string'
                        ? parseFloat(row.apr_percent)
                        : row.apr_percent;
                if (!(typeof raw === 'number' && isFinite(raw))) {
                    return <span className="text-gray-500">—</span>;
                }
                const isPositive = raw > 0;
                const className = isPositive
                    ? 'text-green-700'
                    : raw < 0
                      ? 'text-red-700'
                      : 'text-gray-700';
                return (
                    <span className={className}>
                        {formatPercentage(raw / 100, 2)}
                    </span>
                );
            },
        },
        {
            key: 'status',
            title: 'Status',
            render: (value) => {
                const status = (
                    typeof value === 'string' ? value : ''
                ).toLowerCase();
                const statusConfig = {
                    active: {
                        label: 'Active',
                        class: 'bg-green-100 text-green-800',
                    },
                    paused: {
                        label: 'Paused',
                        class: 'bg-yellow-100 text-yellow-800',
                    },
                    closed: {
                        label: 'Closed',
                        class: 'bg-gray-100 text-gray-800',
                    },
                    liquidating: {
                        label: 'Liquidating',
                        class: 'bg-red-100 text-red-800',
                    },
                };
                const config = statusConfig[
                    status as keyof typeof statusConfig
                ] || {
                    label: status,
                    class: 'bg-gray-100 text-gray-800',
                };
                return (
                    <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.class}`}
                    >
                        {config.label}
                    </span>
                );
            },
        },
        {
            key: 'inception_date',
            title: 'Created',
            type: 'date',
        },
        {
            key: 'actions',
            title: 'Actions',
            render: (_value, _column, row) => (
                <div className="flex space-x-2">
                    {row.status === 'active' && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                void handleCloseVault(row);
                            }}
                            title="Close Vault"
                        >
                            Close
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteVault(row);
                        }}
                        title="Delete Vault"
                    >
                        Delete
                    </Button>
                </div>
            ),
        },
    ];

    const filteredVaults = useMemo(() => {
        if (filter === 'all') return vaults;
        return vaults.filter((vault) =>
            filter === 'active'
                ? vault.status === 'active'
                : vault.status !== 'active'
        );
    }, [vaults, filter]);

    if (loading) {
        return (
            <div className="px-4 py-6 sm:px-0">
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="px-4 py-6 sm:px-0" data-testid="vaults-page">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    Tokenized Vaults
                </h1>
                <p className="text-gray-600">
                    Create custom tokens and track your investment vaults
                </p>
            </div>

            {/* Time Series with unified filter */}
            <div className="mb-6">
                {/* Unified Time Range Filter */}
                <div className="flex justify-end mb-3">
                    <div
                        className="inline-flex rounded-md shadow-sm"
                        role="group"
                    >
                        <Button
                            variant={timeRange === '7d' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTimeRange('7d')}
                            className="rounded-r-none rounded-l-lg"
                        >
                            7D
                        </Button>
                        <Button
                            variant={
                                timeRange === '30d' ? 'default' : 'outline'
                            }
                            size="sm"
                            onClick={() => setTimeRange('30d')}
                            className="rounded-none border-l-0"
                        >
                            30D
                        </Button>
                        <Button
                            variant={
                                timeRange === 'all' ? 'default' : 'outline'
                            }
                            size="sm"
                            onClick={() => setTimeRange('all')}
                            className="rounded-l-none rounded-r-lg border-l-0"
                        >
                            All
                        </Button>
                    </div>
                </div>

                {/* Metrics and Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Metrics Cards (spans all 3 columns) */}
                    <AUMChart
                        timeRange={timeRange}
                        onTimeRangeChange={setTimeRange}
                        vaults={investableVaultIds}
                    />

                    {/* Total PnL Chart */}
                    <Card className="col-span-1 lg:col-span-1">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">
                                Total PnL Over Time
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ height: 280 }}>
                                {pnlSeries.length > 0 ? (
                                    <TimeSeriesLineChart
                                        labels={pnlSeries.map((p) => p.date)}
                                        datasets={[
                                            {
                                                label: 'Total PnL (USD)',
                                                data: pnlSeries.map(
                                                    (p) => p.total_pnl_usd
                                                ),
                                                color: '#059669',
                                                fill: true,
                                            },
                                        ]}
                                        yFormat="currency"
                                        currency="USD"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                                        No PnL data available
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Weighted APR Chart */}
                    <Card className="col-span-1 lg:col-span-1">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">
                                {timeRange === 'all'
                                    ? 'Weighted APR Over Time'
                                    : 'Weighted Return Over Time'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ height: 280 }}>
                                {aprSeries.length > 0 ? (
                                    <TimeSeriesLineChart
                                        labels={aprSeries.map((p) => p.date)}
                                        datasets={[
                                            {
                                                label:
                                                    timeRange === 'all'
                                                        ? 'Weighted APR (%)'
                                                        : 'Weighted Return (%)',
                                                data: aprSeries.map(
                                                    (p) =>
                                                        timeRange === 'all'
                                                            ? p.weighted_apr_percent
                                                            : p.weighted_roi_percent
                                                ),
                                                color: '#2563EB',
                                                fill: true,
                                            },
                                        ]}
                                        yFormat="percent"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                                        {timeRange === 'all'
                                            ? 'No APR data available'
                                            : 'No return data available'}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-3 sm:space-y-0">
                <div className="flex space-x-2">
                    <Button
                        variant={filter === 'all' ? 'default' : 'outline'}
                        onClick={() => setFilter('all')}
                    >
                        All ({vaults.length})
                    </Button>
                    <Button
                        variant={filter === 'active' ? 'default' : 'outline'}
                        onClick={() => setFilter('active')}
                    >
                        Active (
                        {vaults.filter((v) => v.status === 'active').length})
                    </Button>
                    <Button
                        variant={filter === 'closed' ? 'secondary' : 'outline'}
                        onClick={() => setFilter('closed')}
                    >
                        Closed (
                        {vaults.filter((v) => v.status !== 'active').length})
                    </Button>
                </div>

                <Button onClick={handleCreateVault}>
                    <span className="mr-2">+</span> Create Tokenized Vault
                </Button>
            </div>

            {/* Create Vault Form */}
            {showCreateForm && (
                <CreateTokenizedVaultForm
                    onSuccess={() => {
                        setShowCreateForm(false);
                        void loadVaults();
                    }}
                    onCancel={() => setShowCreateForm(false)}
                />
            )}

            {/* Vaults Table */}
            <Card>
                <CardContent className="p-0">
                    <DataTable<TokenizedVault>
                        data={filteredVaults}
                        columns={vaultColumns}
                        loading={loading}
                        error={error}
                        emptyMessage="No vaults found"
                        editable={false}
                        selectableRows={false}
                        onRowClick={handleViewVault}
                        data-testid="vaults-table"
                    />
                </CardContent>
            </Card>
        </div>
    );
};

export default VaultsPage;
