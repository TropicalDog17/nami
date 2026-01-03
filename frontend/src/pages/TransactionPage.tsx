import React, { useState, useEffect, useCallback } from 'react';

import { Button } from '../components/ui/button';
import DataTable, {
  TableColumn,
  TableRowBase,
} from '../components/ui/DataTable';
import { useToast } from '../components/ui/Toast';
import { useApp } from '../context/AppContext';
import { useBackendStatus } from '../context/BackendStatusContext';
import { transactionApi } from '../services/api';
import { fxService } from '../services/fxService';

type Transaction = TableRowBase & Record<string, unknown>;
// Columns now use the generic TableColumn<Transaction>

const TransactionPage: React.FC = () => {
  const { isOnline } = useBackendStatus();
  const { currency, actions } = useApp() as unknown as {
    currency: string;
    actions: {
      setCurrency: (c: string) => void;
      setError: (m: string | null) => void;
    };
  };
  const { success: showSuccessToast } = useToast() as unknown as {
    success: (m: string) => void;
  };
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filters] = useState<Record<string, unknown>>({});

  // FX conversion states
  const [fxConversionCache, setFxConversionCache] = useState<
    Map<string, number>
  >(new Map());
  const [fxLoadingStates, setFxLoadingStates] = useState<Map<string, boolean>>(
    new Map()
  );
  // Online FX rates cache keyed by from-to-date
  const [fxRateCache, setFxRateCache] = useState<Map<string, number>>(
    new Map()
  );

  // Load transactions on mount
  const loadTransactions = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Request FX-enhanced data with USD and VND conversion
      const fxFilters = {
        ...filters,
        currencies: 'USD,VND', // Request FX conversion for both currencies
      };

      const data = (await transactionApi.list(fxFilters)) as unknown[];

      // Handle both TransactionWithFX and basic Transaction responses
      if (
        data &&
        data.length > 0 &&
        'fx_rates' in (data[0] as Record<string, unknown>)
      ) {
        // FX-enhanced response
        setTransactions(data as Transaction[]);
      } else {
        // Fallback to basic response: map backend Transaction -> UI row shape
        const mapped = (data ?? []).map((raw: unknown) => {
          const rawRecord = raw as Record<string, unknown>;
          const assetObj = rawRecord?.asset;
          const assetSym =
            typeof assetObj === 'string'
              ? assetObj
              : ((assetObj as Record<string, unknown> | null)?.symbol ?? '');
          const type =
            (typeof rawRecord?.type === 'string'
              ? rawRecord.type
              : ''
            )?.toLowerCase() ?? '';
          const createdRaw = rawRecord?.createdAt ?? rawRecord?.date;
          const created =
            createdRaw != null && typeof createdRaw === 'string'
              ? createdRaw
              : undefined;
          // normalize date to a full ISO string to ensure Safari/Chrome parsing
          let dateISO: string | undefined = undefined;
          if (created) {
            const d = new Date(created);
            dateISO = Number.isNaN(d.getTime()) ? created : d.toISOString();
          }
          const qty =
            Number(rawRecord?.amount ?? rawRecord?.quantity ?? 0) ?? 0;
          // cashflow sign
          let cashflow = 0;
          if (type === 'income' || type === 'transfer_in') cashflow = qty;
          else if (type === 'expense' || type === 'transfer_out')
            cashflow = -qty;
          else if (type === 'repay') {
            const dir = (
              typeof rawRecord?.direction === 'string'
                ? rawRecord.direction
                : ''
            ).toLowerCase();
            cashflow = dir === 'loan' ? qty : dir === 'borrow' ? -qty : 0;
          } else cashflow = 0; // initial/borrow/loan treated neutral

          const localCurrency = assetSym ?? 'USD';

          const row: Record<string, unknown> = {
            id: rawRecord?.id,
            date: dateISO ?? undefined,
            type,
            asset: assetSym,
            account: rawRecord?.account ?? '',
            quantity: qty,
            amount_local: qty,
            local_currency: localCurrency,
            cashflow_local: cashflow,
            counterparty: rawRecord?.counterparty ?? null,
            tag: rawRecord?.tag ?? null,
            note: rawRecord?.note ?? null,
          };
          return row as Transaction;
        });
        setTransactions(mapped);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      actions.setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters, actions]);

  useEffect(() => {
    if (isOnline) {
      void loadTransactions();
    }
  }, [isOnline, loadTransactions]);

  const handleExportTransactions = (): void => {
    // Define CSV headers based on columns
    const headers = [
      'Date',
      'Type',
      'Asset',
      'Account',
      'Quantity',
      `Amount (${currency})`,
      'Counterparty',
      'Tag',
      'Note',
    ];

    // Convert transaction data to CSV format
    const csvRows = [headers.join(',')];

    transactions.forEach((tx) => {
      const row = [
        // Date
        (() => {
          const raw =
            (tx as Record<string, unknown>)?.date ??
            (tx as Record<string, unknown>)?.createdAt ??
            (tx as Record<string, unknown>)?.at;
          if (!raw || typeof raw !== 'string') return '';
          const d = new Date(raw);
          if (Number.isNaN(d.getTime())) return '';
          return d.toLocaleDateString();
        })(),
        // Type
        String((tx as Record<string, unknown>)?.type ?? ''),
        // Asset
        String((tx as Record<string, unknown>)?.asset ?? ''),
        // Account
        String((tx as Record<string, unknown>)?.account ?? ''),
        // Quantity
        String((tx as Record<string, unknown>)?.quantity ?? ''),
        // Amount (converted to target currency)
        (() => {
          const { amount: convertedAmount } = convertAmountSync(
            tx,
            currency as 'USD' | 'VND'
          );
          return typeof convertedAmount === 'number'
            ? convertedAmount.toFixed(2)
            : '';
        })(),
        // Counterparty
        String((tx as Record<string, unknown>)?.counterparty ?? ''),
        // Tag
        String((tx as Record<string, unknown>)?.tag ?? ''),
        // Note
        String((tx as Record<string, unknown>)?.note ?? ''),
      ];

      // Escape values that contain commas or quotes
      const escapedRow = row.map((value) => {
        const strValue = String(value);
        if (
          strValue.includes(',') ||
          strValue.includes('"') ||
          strValue.includes('\n')
        ) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      });

      csvRows.push(escapedRow.join(','));
    });

    // Create CSV file and trigger download
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `transactions_${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showSuccessToast('Transactions exported successfully');
  };

  // Helper function to get cache key for FX conversion
  const getFXCacheKey = (rowId: string, targetCurrency: string): string => {
    return `${rowId}-${targetCurrency}`;
  };

  // Helper function to convert amount using FX data from API response
  const convertAmountSync = useCallback(
    (
      row: Transaction, // Transaction or TransactionWithFX
      targetCurrency: 'USD' | 'VND'
    ): { amount: number; cashflow: number; isLoading: boolean } => {
      const rowId = String(row?.id ?? 'unknown');
      const cacheKey = getFXCacheKey(rowId, targetCurrency);

      const amountLocal = Number(row?.amount_local ?? 0);
      const localCurrency = (row?.local_currency as string) ?? 'USD';
      const cashflowLocal = Number(row?.cashflow_local ?? 0);

      // Check cached converted value first
      if (fxConversionCache.has(cacheKey)) {
        const cachedAmount = fxConversionCache.get(cacheKey);
        if (cachedAmount !== undefined) {
          return {
            amount: cachedAmount,
            cashflow: cachedAmount,
            isLoading: false,
          };
        }
      }

      // If same currency, no conversion needed
      if (localCurrency === targetCurrency) {
        return {
          amount: amountLocal,
          cashflow: cashflowLocal,
          isLoading: false,
        };
      }

      // 1) Use FX rates from backend response if available
      if (row?.fx_rates) {
        const fxRates = row.fx_rates as Record<string, number>;
        const directKey = `${localCurrency}-${targetCurrency}`;
        const rate = fxRates[directKey];
        if (rate && rate > 0) {
          const convertedAmount = amountLocal * rate;
          const convertedCashflow = cashflowLocal * rate;
          setFxConversionCache((prev) =>
            new Map(prev).set(cacheKey, convertedAmount)
          );
          return {
            amount: convertedAmount,
            cashflow: convertedCashflow,
            isLoading: false,
          };
        }
      }

      // 2) Try a cached online rate (per date)
      const dateStr = (() => {
        const raw = row?.date as string | undefined;
        if (!raw) return 'today';
        const d = new Date(raw);
        return Number.isNaN(d.getTime())
          ? 'today'
          : d.toISOString().split('T')[0];
      })();
      const rateKey = `${localCurrency}-${targetCurrency}-${dateStr}`;
      if (fxRateCache.has(rateKey)) {
        const rate = fxRateCache.get(rateKey);
        if (rate !== undefined) {
          const convertedAmount = amountLocal * rate;
          const convertedCashflow = cashflowLocal * rate;
          setFxConversionCache((prev) =>
            new Map(prev).set(cacheKey, convertedAmount)
          );
          return {
            amount: convertedAmount,
            cashflow: convertedCashflow,
            isLoading: false,
          };
        }
      }

      // 3) Kick off an async online fetch if not already loading
      if (!fxLoadingStates.get(rateKey)) {
        setFxLoadingStates((prev) => new Map(prev).set(rateKey, true));
        const rawDate = row?.date as string | undefined;
        const dt = rawDate ? new Date(rawDate) : undefined;
        void fxService
          .getFXRate(localCurrency, targetCurrency, dt)
          .then((rate) => {
            setFxRateCache((prev) => new Map(prev).set(rateKey, rate));
            const amt = amountLocal * rate;
            setFxConversionCache((prev) => new Map(prev).set(cacheKey, amt));
          })
          .catch(() => {
            // ignore, we'll fall back below
          })
          .finally(() => {
            setFxLoadingStates((prev) => new Map(prev).set(rateKey, false));
          });
      }

      // 4) Fallback while online fetch is in-flight: compute deterministic USD/VND pair fallback
      let fallbackRate = 1;
      const lc = localCurrency.toUpperCase();
      const tc = targetCurrency.toUpperCase();
      if (lc === 'USD' && tc === 'VND') fallbackRate = 24000;
      else if (lc === 'VND' && tc === 'USD') fallbackRate = 1 / 24000;
      else if (tc === 'VND')
        fallbackRate = 24000; // best-effort when converting to VND
      else fallbackRate = 1;

      const convertedAmount = amountLocal * fallbackRate;
      const convertedCashflow = cashflowLocal * fallbackRate;

      // IMPORTANT: do NOT cache the fallback so the UI can update once the online rate arrives
      return {
        amount: convertedAmount,
        cashflow: convertedCashflow,
        isLoading: true,
      };
    },
    [fxConversionCache, fxRateCache, fxLoadingStates]
  );

  const columns: TableColumn<Transaction>[] = [
    {
      key: 'date',
      title: 'Date',
      type: 'date',
      editable: true,
      editType: 'date',
      render: (_value, _column, row) => {
        const raw =
          (row as Record<string, unknown>)?.date ??
          (row as Record<string, unknown>)?.createdAt ??
          (row as Record<string, unknown>)?.at;
        if (!raw || typeof raw !== 'string') return '-';
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleDateString();
      },
    },
    {
      key: 'type',
      title: 'Type',
      editable: true,
      editType: 'select',
      render: (value, _column, row) => {
        // Normalize value
        const type = String((value as string) ?? '').toLowerCase();
        const isInternal =
          Boolean((row as Record<string, unknown>)?.internal_flow) &&
          (type === 'transfer_in' || type === 'transfer_out');

        // Categorize types for coloring
        const INFLOW_TYPES = [
          'buy',
          'income',
          'reward',
          'airdrop',
          'transfer_in',
          'repay',
          'interest',
        ];
        const OUTFLOW_TYPES = [
          'sell',
          'expense',
          'fee',
          'repay_borrow',
          'interest_expense',
          'transfer_out',
          'lend',
        ];
        const NEUTRAL_TYPES = ['deposit', 'withdraw', 'borrow'];

        const isInflow = !isInternal && INFLOW_TYPES.includes(type);
        const isOutflow = !isInternal && OUTFLOW_TYPES.includes(type);
        const isNeutral =
          isInternal ||
          NEUTRAL_TYPES.includes(type) ||
          (!isInflow && !isOutflow);

        const cls = isInflow
          ? 'bg-green-100 text-green-800'
          : isOutflow
            ? 'bg-red-100 text-red-800'
            : 'bg-gray-100 text-gray-800';

        const typeLabel = (isInternal ? 'internal' : type || 'unknown')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        return (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}
            title={
              isInternal
                ? 'Internal transfer'
                : isNeutral
                  ? 'Neutral cash flow'
                  : isInflow
                    ? 'Inflow'
                    : 'Outflow'
            }
          >
            {typeLabel}
          </span>
        );
      },
    },
    {
      key: 'asset',
      title: 'Asset',
      editable: true,
      editType: 'select',
      render: (value) => {
        if (!value) return '-';
        if (typeof value === 'string') return value;
        try {
          const v = value as Record<string, unknown>;
          if (v?.symbol && typeof v.symbol === 'string') return v.symbol;
        } catch {
          // Fall through to default handling
        }
        // Fallback - handle objects safely
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value);
        }
        if (typeof value === 'string') return value;
        return '-';
      },
    },
    {
      key: 'account',
      title: 'Account',
      editable: true,
      editType: 'select',
    },
    {
      key: 'quantity',
      title: 'Quantity',
      type: 'number',
      decimals: 8,
      editable: true,
      editType: 'number',
    },
    {
      key: 'amount',
      title: `Amount (${currency})`,
      type: 'currency',
      currency: currency,
      render: (_value, _column, row) => {
        const numberFormatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency === 'USD' || currency === 'VND' ? currency : 'USD',
        });

        const _type = (row as Record<string, unknown>).type;
        const type = typeof _type === 'string' ? _type.toLowerCase() : '';
        const isNeutral = ['deposit', 'withdraw', 'borrow'].includes(type);

        // Use synchronous conversion with stored FX rates
        const { amount: _convertedAmount, cashflow: _convertedCashflow } =
          convertAmountSync(row, currency as 'USD' | 'VND');
        const convertedAmount =
          typeof _convertedAmount === 'number' ? _convertedAmount : 0;
        const convertedCashflow =
          typeof _convertedCashflow === 'number' ? _convertedCashflow : 0;

        // For zero amounts, return dash
        if (convertedAmount === 0 && convertedCashflow === 0) {
          return '-';
        }

        // Display converted amounts
        if (isNeutral) {
          return (
            <span className="font-medium text-gray-800">
              {numberFormatter.format(convertedAmount)}
            </span>
          );
        }

        const isPositive = convertedCashflow > 0;
        const formatted = numberFormatter.format(Math.abs(convertedCashflow));
        const sign = isPositive ? '+' : '-';
        const cls = isPositive ? 'text-green-700' : 'text-red-700';
        return (
          <span className={`font-medium ${cls}`}>{`${sign}${formatted}`}</span>
        );
      },
    },
    {
      key: 'counterparty',
      title: 'Counterparty',
      editable: true,
      editType: 'text',
    },
    {
      key: 'tag',
      title: 'Tag',
      editable: true,
      editType: 'select',
    },
    // Actions column handled by DataTable's built-in actions prop
  ];

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1
              className="text-2xl font-bold text-gray-900"
              data-testid="transactions-page-title"
            >
              Transactions
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Track your financial transactions with dual currency valuation and
              comprehensive reporting.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={() => handleExportTransactions()}
            >
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Currency Toggle */}
      <div className="mb-6">
        <div className="inline-flex rounded-md shadow-sm">
          <Button
            variant={currency === 'USD' ? 'default' : 'outline'}
            className="rounded-r-none"
            onClick={() => actions.setCurrency('USD')}
          >
            USD View
          </Button>
          <Button
            variant={currency === 'VND' ? 'default' : 'outline'}
            className="rounded-l-none"
            onClick={() => actions.setCurrency('VND')}
          >
            VND View
          </Button>
        </div>
      </div>

      {/* Quick Actions removed */}

      {/* Transactions Table */}
      <DataTable
        data={transactions}
        columns={columns}
        loading={loading}
        error={error}
        emptyMessage="No transactions found."
        editable={false}
        onRowClick={null}
        actions={[]}
      />
    </div>
  );
};

export default TransactionPage;
