import React, { useState, useEffect, useMemo } from 'react';

import TransactionForm from '../components/TransactionForm';
import DataTable from '../components/ui/DataTable';
import DateInput from '../components/ui/DateInput';
import ComboBox from '../components/ui/ComboBox';
import { useToast } from '../components/ui/Toast';
import { useApp } from '../context/AppContext';
import { useBackendStatus } from '../context/BackendStatusContext';
import {
  transactionApi,
  adminApi,
  actionsApi,
  pricesApi,
} from '../services/api';

type IdType = string | number;
type Transaction = { id: IdType; [key: string]: any };
type Option = { value: string; label: string };
type MasterData = Record<string, Option[]>;
type Column = {
  key: string;
  title: string;
  type?: 'date' | 'datetime' | 'currency' | 'number' | 'text' | string;
  width?: number | string;
  editable?: boolean;
  editType?: 'select' | 'date' | 'number' | 'text' | string;
  render?: (value: any, column: any, row: any) => React.ReactNode;
  decimals?: number;
  currency?: string;
};

const TransactionPage: React.FC = () => {
  const { currency, actions } = useApp() as unknown as {
    currency: string;
    actions: {
      setCurrency: (c: string) => void;
      setError: (m: string | null) => void;
    };
  };
  const { isOnline } = useBackendStatus() as unknown as { isOnline: boolean };
  const { error: showErrorToast, success: showSuccessToast } =
    useToast() as unknown as {
      error: (m: string) => void;
      success: (m: string) => void;
    };
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [masterData, setMasterData] = useState<MasterData>({});
  const [performing, setPerforming] = useState<boolean>(false);
  const [bulkRefreshing, setBulkRefreshing] = useState<boolean>(false);
  const [busyRowIds, setBusyRowIds] = useState<Set<IdType>>(new Set<IdType>());
  const [actionForm, setActionForm] = useState<{
    action: string;
    params: Record<string, any>;
  }>({
    action: '',
    params: {},
  });
  const [activeStakeOptions, setActiveStakeOptions] = useState<Option[]>([]);
  const [stakeIdToInfo, setStakeIdToInfo] = useState<Record<string, any>>({});

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Load transactions and master data on mount
  useEffect(() => {
    loadTransactions();
    loadMasterData();
  }, [filters]);

  // Auto-fetch price for spot buy when base/quote/date change and no manual price entered
  useEffect(() => {
    const p = actionForm.params || {};
    if (actionForm.action !== 'spot_buy') return;
    const base = String(p.base_asset || '').trim();
    const quote = String(p.quote_asset || '').trim();
    const date = String(p.date || todayStr);
    const hasManualPrice = String(p.price_quote || '').trim().length > 0;
    if (!base || !quote || hasManualPrice) return;
    // fetch daily price for the chosen date (single day window)
    const start = date;
    const end = date;
    let cancelled = false;
    (async () => {
      try {
        const res: any = await pricesApi.daily(base, quote, start, end);
        const arr = Array.isArray(res) ? res : [];
        const last = arr[arr.length - 1];
        const price = last && (last.price || last.Price);
        if (price && !cancelled) {
          setActionForm((s) => ({
            ...s,
            params: { ...s.params, price_quote: String(price) },
          }));
        }
      } catch (e) {
        // silent; user can enter price manually
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    actionForm.action,
    actionForm.params.base_asset,
    actionForm.params.quote_asset,
    actionForm.params.date,
    todayStr,
  ]);

  // Load active stakes when switching to Unstake action
  const loadActiveStakes = async (): Promise<void> => {
    try {
      // Fetch accounts to filter investment accounts
      const accounts = (await adminApi.listAccounts()) as any[];
      const investmentAccounts = (accounts || []).filter(
        (a: any) => (a?.type || '').toLowerCase() === 'investment'
      );
      const investNames = investmentAccounts.map((a: any) => a.name);

      // Fetch deposit transactions for those accounts
      const deposits = (await transactionApi.list({
        types: ['deposit'],
        accounts: investNames,
      })) as any[];
      const openDeposits = (deposits || []).filter((t: any) => !t.exit_date);

      const idToInfo: Record<string, any> = {};
      const options: Option[] = openDeposits.map((t: any) => {
        idToInfo[String(t.id)] = t;
        const d = new Date(t.date);
        const dStr = isNaN(d.getTime())
          ? String(t.date)
          : d.toISOString().split('T')[0];
        return {
          value: String(t.id),
          label: `${t.asset} @ ${t.account} — ${dStr} — ${t.id}`,
        } as Option;
      });

      setStakeIdToInfo(idToInfo);
      setActiveStakeOptions(options);
    } catch (e) {
      // Silent failure; combo will simply be empty
    }
  };

  useEffect(() => {
    if (actionForm.action === 'unstake') {
      loadActiveStakes();
    }
  }, [actionForm.action]);

  const loadMasterData = async (): Promise<void> => {
    try {
      const [types, accounts, assets, tags] = (await Promise.all([
        adminApi.listTypes(),
        adminApi.listAccounts(),
        adminApi.listAssets(),
        adminApi.listTags(),
      ])) as [any[], any[], any[], any[]];

      setMasterData({
        type: (types || []).map((t: any) => ({
          value: t.name,
          label: t.description || t.name,
        })),
        account: (accounts || []).map((a: any) => ({
          value: a.name,
          label: `${a.name} (${a.type})`,
        })),
        asset: (assets || []).map((a: any) => ({
          value: a.symbol,
          label: `${a.symbol} - ${a.name}`,
        })),
        tag: (tags || []).map((t: any) => ({
          value: t.name,
          label: `${t.name} (${t.category})`,
        })),
        counterparty: [], // This could be populated from recent counterparties
      });
      console.log('Master data loaded:', { types, accounts, assets, tags });
    } catch (err: any) {
      console.error('Failed to load master data:', err);
    }
  };

  const loadTransactions = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const data = (await transactionApi.list(filters)) as any[];
      setTransactions((data || []) as Transaction[]);
    } catch (err: any) {
      setError(err);
      actions.setError(err?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handlePerformAction = async (): Promise<void> => {
    if (!actionForm.action) {
      showErrorToast('Please select an action');
      return;
    }
    try {
      setPerforming(true);
      const resp: any = await actionsApi.perform(
        actionForm.action,
        actionForm.params
      );
      const created: Transaction[] = (resp?.transactions ||
        []) as Transaction[];
      if (created.length > 0) {
        setTransactions((prev) => [...created, ...prev]);
      } else {
        await loadTransactions();
      }

      // Reload active stakes list if we just performed a stake or unstake action
      if (actionForm.action === 'stake' || actionForm.action === 'unstake') {
        await loadActiveStakes();
      }

      showSuccessToast('Action performed successfully');
      setActionForm({ action: '', params: {} });
    } catch (err: any) {
      actions.setError(err?.message ?? 'Unknown error');
      showErrorToast('Failed to perform action');
    } finally {
      setPerforming(false);
    }
  };

  const handleCreateTransaction = async (
    transactionData: Record<string, any>
  ): Promise<void> => {
    try {
      const newTransaction = (await transactionApi.create(
        transactionData
      )) as Transaction;
      setTransactions((prev) => [newTransaction, ...prev]);
      setShowForm(false);
      actions.setError(null);
      showSuccessToast('Transaction created successfully');
    } catch (err: any) {
      actions.setError(err?.message ?? 'Unknown error');
      showErrorToast('Failed to create transaction. Please try again.');
    }
  };

  const handleUpdateTransaction = async (
    transactionData: Record<string, any>
  ): Promise<void> => {
    try {
      if (!editingTransaction) return;
      const updatedTransaction = await transactionApi.update(
        editingTransaction.id,
        transactionData
      );
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.id === editingTransaction.id
            ? (updatedTransaction as Transaction)
            : tx
        )
      );
      setEditingTransaction(null);
      setShowForm(false);
      actions.setError(null);
      showSuccessToast('Transaction updated successfully');
    } catch (err: any) {
      actions.setError(err?.message ?? 'Unknown error');
      showErrorToast('Failed to update transaction. Please try again.');
    }
  };

  const handleDeleteTransaction = async (id: IdType): Promise<void> => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    try {
      await transactionApi.delete(id);
      setTransactions((prev) => prev.filter((tx) => tx.id !== id));
      actions.setError(null);
      showSuccessToast('Transaction deleted successfully');
    } catch (err: any) {
      actions.setError(err?.message ?? 'Unknown error');
      showErrorToast('Failed to delete transaction. Please try again.');
    }
  };

  const handleEditClick = (transaction: Transaction): void => {
    setEditingTransaction(transaction);
    setShowForm(true);
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingTransaction(null);
  };

  const handleInlineEdit = async (
    transactionId: IdType,
    field: string,
    newValue: any
  ): Promise<void> => {
    try {
      // Find the transaction to update
      const transaction = transactions.find((t) => t.id === transactionId);
      if (!transaction) return;

      console.log('Inline edit:', {
        transactionId,
        field,
        newValue,
      });

      // Update local state optimistically
      const updatedTransaction: Transaction = {
        ...transaction,
        [field]: newValue,
      };
      setTransactions((prev) =>
        prev.map((t) => (t.id === transactionId ? updatedTransaction : t))
      );

      // Make API call to persist changes
      const updateData = { [field]: newValue };
      await transactionApi.update(transactionId, updateData);

      actions.setError(null);
      showSuccessToast(`${field} updated successfully`);
    } catch (err: any) {
      console.error('Inline edit error:', err);
      actions.setError(
        `Failed to update ${field}: ${err?.message ?? 'Unknown error'}`
      );
      showErrorToast(`Failed to update ${field}. Please try again.`);
      // Reload transactions to revert any optimistic updates
      loadTransactions();
    }
  };

  const columns: Column[] = [
    {
      key: 'date',
      title: 'Date',
      type: 'date',
      editable: true,
      editType: 'date',
    },
    {
      key: 'type',
      title: 'Type',
      editable: true,
      editType: 'select',
      render: (value: any, _column: any, row?: any) => {
        // Normalize value
        const type = String(value || '').toLowerCase();
        const isInternal =
          Boolean(row?.internal_flow) &&
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
      key: currency === 'USD' ? 'amount_usd' : 'amount_vnd',
      title: `Amount (${currency})`,
      type: 'currency',
      currency: currency,
      render: (_value: any, _column: any, row: any) => {
        const numberFormatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency,
        });
        const type = String(row?.type || '').toLowerCase();
        const isNeutral = ['deposit', 'withdraw', 'borrow'].includes(type);
        if (isNeutral) {
          const amt =
            currency === 'USD'
              ? Number(row?.amount_usd || 0)
              : Number(row?.amount_vnd || 0);
          if (!amt) return '-';
          return (
            <span className="font-medium text-gray-800">
              {numberFormatter.format(amt)}
            </span>
          );
        }
        const cashflow =
          currency === 'USD'
            ? Number(row?.cashflow_usd || 0)
            : Number(row?.cashflow_vnd || 0);
        if (!cashflow) return '-';
        const isPositive = cashflow > 0;
        const formatted = numberFormatter.format(Math.abs(cashflow));
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

  if (showForm) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <button
            onClick={handleFormCancel}
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Transactions
          </button>
        </div>

        <TransactionForm
          transaction={editingTransaction as any}
          onSubmit={
            editingTransaction
              ? handleUpdateTransaction
              : handleCreateTransaction
          }
          onCancel={handleFormCancel}
        />
      </div>
    );
  }

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
          <div className="flex space-x-3">
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Transaction
            </button>
            <button
              onClick={async () => {
                try {
                  setBulkRefreshing(true);
                  await adminApi.recalcFX(false);
                  await loadTransactions();
                  showSuccessToast('Refreshed derived fields (missing only)');
                } catch (e) {
                  showErrorToast('Refresh failed');
                } finally {
                  setBulkRefreshing(false);
                }
              }}
              className={`inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${bulkRefreshing ? 'opacity-70 cursor-not-allowed' : ''}`}
              disabled={bulkRefreshing}
            >
              {bulkRefreshing ? (
                <svg
                  className="w-4 h-4 mr-2 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0019 5"
                  />
                </svg>
              )}
              {bulkRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Currency Toggle */}
      <div className="mb-6">
        <div className="inline-flex rounded-md shadow-sm">
          <button
            onClick={() => actions.setCurrency('USD')}
            className={`px-4 py-2 text-sm font-medium border rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              currency === 'USD'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            USD View
          </button>
          <button
            onClick={() => actions.setCurrency('VND')}
            className={`px-4 py-2 text-sm font-medium border-t border-b border-r rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              currency === 'VND'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            VND View
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-6 p-4 border border-gray-200 rounded-md">
        <h3 className="text-md font-semibold mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Action
            </label>
            <select
              className="w-full px-3 py-2 border rounded-md"
              value={actionForm.action}
              onChange={(e) =>
                setActionForm({ action: e.target.value, params: {} })
              }
            >
              <option value="">Select an action</option>
              <option value="init_balance">
                Init Balance (seed existing holding)
              </option>
              <option value="p2p_buy_usdt">P2P: Buy USDT with VND</option>
              <option value="p2p_sell_usdt">P2P: Sell USDT for VND</option>
              <option value="spend_vnd">Spend VND (daily)</option>
              <option value="credit_spend_vnd">Spend VND (credit card)</option>
              <option value="spot_buy">Spot Buy (pay with quote)</option>
              <option value="borrow">Borrow</option>
              <option value="repay_borrow">Repay Borrow</option>
              <option value="stake">Stake (investment)</option>
              <option value="unstake">Unstake (investment)</option>
              <option value="internal_transfer">Internal Transfer</option>
            </select>
          </div>

          {/* Dynamic params */}
          {actionForm.action === 'p2p_buy_usdt' ||
          actionForm.action === 'p2p_sell_usdt' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, date: v },
                  }))
                }
              />
              <ComboBox
                options={(masterData.account || []) as any}
                value={actionForm.params.bank_account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, bank_account: v },
                  }))
                }
                placeholder="Bank Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'bank',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <ComboBox
                options={(masterData.account || []) as any}
                value={actionForm.params.exchange_account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, exchange_account: v },
                  }))
                }
                placeholder="Exchange Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'exchange',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="VND Amount"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, vnd_amount: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Price VND per USDT"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, price_vnd_per_usdt: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Fee VND (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, fee_vnd: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Counterparty (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, counterparty: e.target.value },
                  }))
                }
              />
            </div>
          ) : null}

          {actionForm.action === 'spend_vnd' ||
          actionForm.action === 'credit_spend_vnd' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, date: v },
                  }))
                }
              />
              <ComboBox
                options={(masterData.account || []) as any}
                value={actionForm.params.account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, account: v },
                  }))
                }
                placeholder="Account (Bank/CreditCard)"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'bank',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="VND Amount"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, vnd_amount: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Counterparty"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, counterparty: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Tag"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, tag: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Note"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, note: e.target.value },
                  }))
                }
              />
            </div>
          ) : null}

          {actionForm.action === 'init_balance' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, date: v },
                  }))
                }
              />
              <ComboBox
                options={masterData.account || []}
                value={actionForm.params.account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, account: v },
                  }))
                }
                placeholder="Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'bank',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <ComboBox
                options={(masterData.asset || []) as any}
                value={actionForm.params.asset || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, asset: v },
                  }))
                }
                placeholder="Asset"
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Quantity"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, quantity: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Price Local (default 1)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, price_local: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="FX to USD (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, fx_to_usd: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="FX to VND (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, fx_to_vnd: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Tag (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, tag: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Note (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, note: e.target.value },
                  }))
                }
              />
            </div>
          ) : null}

          {actionForm.action === 'spot_buy' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, date: v },
                  }))
                }
              />
              <ComboBox
                options={(masterData.account || []) as any}
                value={actionForm.params.exchange_account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, exchange_account: v },
                  }))
                }
                placeholder="Exchange Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'exchange',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Base Asset (e.g., BTC)"
                value={actionForm.params.base_asset || ''}
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, base_asset: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Quote Asset (e.g., USDT)"
                value={actionForm.params.quote_asset || ''}
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, quote_asset: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Quantity (base)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, quantity: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Price (quote)"
                value={actionForm.params.price_quote || ''}
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, price_quote: e.target.value },
                  }))
                }
              />
              {/* Fee mode */}
              <select
                className="px-3 py-2 border rounded"
                value={actionForm.params.fee_mode || ''}
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, fee_mode: e.target.value },
                  }))
                }
              >
                <option value="">Fee: none</option>
                <option value="percent">Fee: percent of spend</option>
                <option value="base">Fee: in base asset</option>
                <option value="quote">Fee: in quote asset</option>
              </select>
              {actionForm.params.fee_mode === 'percent' && (
                <input
                  className="px-3 py-2 border rounded"
                  placeholder="Fee %"
                  onChange={(e) =>
                    setActionForm((s) => ({
                      ...s,
                      params: { ...s.params, fee_percent: e.target.value },
                    }))
                  }
                />
              )}
              {actionForm.params.fee_mode === 'base' && (
                <input
                  className="px-3 py-2 border rounded"
                  placeholder="Fee (base)"
                  onChange={(e) =>
                    setActionForm((s) => ({
                      ...s,
                      params: { ...s.params, fee_base: e.target.value },
                    }))
                  }
                />
              )}
              {actionForm.params.fee_mode === 'quote' && (
                <input
                  className="px-3 py-2 border rounded"
                  placeholder="Fee (quote)"
                  onChange={(e) =>
                    setActionForm((s) => ({
                      ...s,
                      params: { ...s.params, fee_quote: e.target.value },
                    }))
                  }
                />
              )}
              <input
                className="px-3 py-2 border rounded"
                placeholder="Counterparty (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, counterparty: e.target.value },
                  }))
                }
              />
            </div>
          ) : null}

          {actionForm.action === 'internal_transfer' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, date: v },
                  }))
                }
              />
              <ComboBox
                options={(masterData.account || []) as any}
                value={actionForm.params.source_account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, source_account: v },
                  }))
                }
                placeholder="Source Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'bank',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <ComboBox
                options={(masterData.account || []) as any}
                value={actionForm.params.destination_account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, destination_account: v },
                  }))
                }
                placeholder="Destination Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'bank',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <ComboBox
                options={(masterData.asset || []) as any}
                value={actionForm.params.asset || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, asset: v },
                  }))
                }
                placeholder="Asset"
                allowCreate
                onCreate={async (symbol) => {
                  await adminApi.createAsset({
                    symbol,
                    name: symbol,
                    decimals: 0,
                    is_active: true,
                  });
                  const assets = await adminApi.listAssets();
                  setMasterData((prev) => ({
                    ...prev,
                    asset: ((assets as any[]) || []).map((a: any) => ({
                      value: a.symbol,
                      label: `${a.symbol} - ${a.name}`,
                    })),
                  }));
                }}
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Amount"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, amount: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Counterparty (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, counterparty: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Note (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, note: e.target.value },
                  }))
                }
              />
            </div>
          )}

          {actionForm.action === 'borrow' ||
          actionForm.action === 'repay_borrow' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, date: v },
                  }))
                }
              />
              <ComboBox
                options={(masterData.account || []) as any}
                value={actionForm.params.account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, account: v },
                  }))
                }
                placeholder="Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'bank',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <ComboBox
                options={(masterData.asset || []) as any}
                value={actionForm.params.asset || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, asset: v },
                  }))
                }
                placeholder="Asset"
                allowCreate
                onCreate={async (symbol) => {
                  await adminApi.createAsset({
                    symbol,
                    name: symbol,
                    decimals: 0,
                    is_active: true,
                  });
                  const assets = await adminApi.listAssets();
                  setMasterData((prev) => ({
                    ...prev,
                    asset: ((assets as any[]) || []).map((a: any) => ({
                      value: a.symbol,
                      label: `${a.symbol} - ${a.name}`,
                    })),
                  }));
                }}
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Amount"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, amount: e.target.value },
                  }))
                }
              />
              {actionForm.action === 'repay_borrow' && (
                <input
                  className="px-3 py-2 border rounded"
                  placeholder="Borrow Tx ID (optional)"
                  onChange={(e) =>
                    setActionForm((s) => ({
                      ...s,
                      params: { ...s.params, borrow_id: e.target.value },
                    }))
                  }
                />
              )}
              <input
                className="px-3 py-2 border rounded"
                placeholder="Counterparty (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, counterparty: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Note (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, note: e.target.value },
                  }))
                }
              />
            </div>
          ) : null}

          {actionForm.action === 'stake' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, date: v },
                  }))
                }
              />
              <ComboBox
                options={(masterData.account || []) as any}
                value={actionForm.params.source_account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, source_account: v },
                  }))
                }
                placeholder="Source Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'bank',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <ComboBox
                options={(masterData.account || []) as any}
                value={actionForm.params.investment_account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, investment_account: v },
                  }))
                }
                placeholder="Investment Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'investment',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <ComboBox
                options={(masterData.asset || []) as any}
                value={actionForm.params.asset || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, asset: v },
                  }))
                }
                placeholder="Asset"
                allowCreate
                onCreate={async (symbol) => {
                  await adminApi.createAsset({
                    symbol,
                    name: symbol,
                    decimals: 0,
                    is_active: true,
                  });
                  const assets = await adminApi.listAssets();
                  setMasterData((prev) => ({
                    ...prev,
                    asset: ((assets as any[]) || []).map((a: any) => ({
                      value: a.symbol,
                      label: `${a.symbol} - ${a.name}`,
                    })),
                  }));
                }}
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Amount"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, amount: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Fee % (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, fee_percent: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Horizon 'short-term'|'long-term' (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, horizon: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Tag (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, tag: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Counterparty (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, counterparty: e.target.value },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Note (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, note: e.target.value },
                  }))
                }
              />
            </div>
          )}

          {actionForm.action === 'unstake' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, date: v },
                  }))
                }
              />
              <ComboBox
                options={activeStakeOptions as any}
                value={actionForm.params.stake_deposit_tx_id || ''}
                onChange={(id) => {
                  const info = stakeIdToInfo[String(id)] || {};
                  setActionForm((s) => ({
                    ...s,
                    params: {
                      ...s.params,
                      stake_deposit_tx_id: id,
                      investment_account:
                        info.account || s.params.investment_account,
                      asset: info.asset || s.params.asset,
                    },
                  }));
                }}
                placeholder="Active Investment (optional)"
              />
              <ComboBox
                options={(masterData.account || []) as any}
                value={actionForm.params.investment_account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, investment_account: v },
                  }))
                }
                placeholder="Investment Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'investment',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <ComboBox
                options={masterData.account || []}
                value={actionForm.params.destination_account || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, destination_account: v },
                  }))
                }
                placeholder="Destination Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'bank',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: ((accounts as any[]) || []).map((a: any) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <ComboBox
                options={(masterData.asset || []) as any}
                value={actionForm.params.asset || ''}
                onChange={(v) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, asset: v },
                  }))
                }
                placeholder="Asset"
                allowCreate
                onCreate={async (symbol) => {
                  await adminApi.createAsset({
                    symbol,
                    name: symbol,
                    decimals: 0,
                    is_active: true,
                  });
                  const assets = await adminApi.listAssets();
                  setMasterData((prev) => ({
                    ...prev,
                    asset: ((assets as any[]) || []).map((a: any) => ({
                      value: a.symbol,
                      label: `${a.symbol} - ${a.name}`,
                    })),
                  }));
                }}
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Amount (required)"
                value={actionForm.params.amount || ''}
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, amount: e.target.value },
                  }))
                }
                required
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Exit Price USD (optional)"
                type="number"
                step="any"
                value={actionForm.params.exit_price_usd || ''}
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, exit_price_usd: e.target.value },
                  }))
                }
              />
              <div className="flex items-center space-x-2">
                <input
                  id="unstake-close-all"
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  checked={Boolean(actionForm.params.close_all)}
                  onChange={(e) =>
                    setActionForm((s) => ({
                      ...s,
                      params: { ...s.params, close_all: e.target.checked },
                    }))
                  }
                />
                <label
                  htmlFor="unstake-close-all"
                  className="text-sm text-gray-700"
                  title="Mark the original stake position as closed"
                >
                  Close Position
                </label>
              </div>
              <input
                className="px-3 py-2 border rounded"
                placeholder="Stake Deposit Tx ID (optional)"
                value={actionForm.params.stake_deposit_tx_id || ''}
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: {
                      ...s.params,
                      stake_deposit_tx_id: e.target.value,
                    },
                  }))
                }
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Note (optional)"
                onChange={(e) =>
                  setActionForm((s) => ({
                    ...s,
                    params: { ...s.params, note: e.target.value },
                  }))
                }
              />
            </div>
          )}

          <div className="flex items-end">
            <button
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              onClick={handlePerformAction}
              disabled={performing}
            >
              {performing ? 'Performing...' : 'Perform Action'}
            </button>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <DataTable
        data={transactions as any[]}
        columns={columns as any[]}
        loading={loading}
        error={error}
        emptyMessage="No transactions found. Create your first transaction above."
        editable={true}
        onCellEdit={handleInlineEdit}
        masterData={masterData as any}
        onRowClick={null}
        actions={['edit', 'delete', 'recalc']}
        onEdit={handleEditClick as any}
        onDelete={handleDeleteTransaction as any}
        busyRowIds={busyRowIds as any}
        onRecalc={async (row: any) => {
          try {
            setBusyRowIds((s) => {
              const next = new Set(s);
              next.add(row.id as IdType);
              return next;
            });
            const updated = await transactionApi.recalc(row.id, false);
            if (updated) {
              setTransactions((prev) =>
                prev.map((t) =>
                  t.id === row.id ? (updated as Transaction) : t
                )
              );
              showSuccessToast('Row refreshed');
            } else {
              await loadTransactions();
            }
          } catch (e) {
            showErrorToast('Row refresh failed');
          } finally {
            setBusyRowIds((s) => {
              const next = new Set(s);
              next.delete(row.id as IdType);
              return next;
            });
          }
        }}
      />
    </div>
  );
};

export default TransactionPage;
