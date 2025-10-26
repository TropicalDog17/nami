import React, { useState, useEffect, useMemo } from 'react';

import TransactionForm from '../components/TransactionForm';
import SmartActionModal from '../components/SmartActionModal';
import FastInvestmentButton from '../components/FastInvestmentButton';
import DataTable from '../components/ui/DataTable';
import DateInput from '../components/ui/DateInput';
import ComboBox from '../components/ui/ComboBox';
import { useToast } from '../components/ui/Toast';
import { useApp } from '../context/AppContext';
import { useBackendStatus } from '../context/BackendStatusContext';
import { useSmartTransaction } from '../hooks/useSmartTransaction';
import {
  transactionApi,
  adminApi,
  actionsApi,
  pricesApi,
  investmentsApi,
} from '../services/api';

type IdType = string | number;
type Transaction = { id: IdType;[key: string]: any };
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
  const [showSmartAction, setShowSmartAction] = useState<boolean>(false);
  const [initialActionType, setInitialActionType] = useState<'expense' | 'income' | 'transfer' | 'repay_borrow'>('expense');
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [masterData, setMasterData] = useState<MasterData>({});
  const [bulkRefreshing, setBulkRefreshing] = useState<boolean>(false);
  const [busyRowIds, setBusyRowIds] = useState<Set<IdType>>(new Set<IdType>());
  const [selectedIds, setSelectedIds] = useState<Set<IdType>>(new Set<IdType>());
  const { createTransaction, isLoading: isTransactionLoading, error: transactionError } = useSmartTransaction();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Ensure any date string includes time (RFC 3339). If only YYYY-MM-DD provided, append current time.
  const toISODateTime = (value?: string): string => {
    if (!value) return new Date().toISOString();
    const s = String(value);
    if (s.includes('T')) return s;
    const timePart = new Date().toISOString().split('T')[1];
    return `${s}T${timePart}`;
  };

  // Load transactions and master data on mount
  useEffect(() => {
    loadTransactions();
    loadMasterData();
  }, [filters]);

  // Global keyboard shortcut: 'n' to toggle Smart Action Modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.getAttribute('contenteditable') === 'true') {
        return; // don't hijack typing in inputs
      }
      if (e.key.toLowerCase() === 'n') {
        setShowSmartAction((s) => !s);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Smart Action handlers
  const handleSmartActionSubmit = async (transactionData: any) => {
    try {
      const newTransaction = await createTransaction(transactionData);
      setTransactions((prev) => [newTransaction as any, ...prev]);
      showSuccessToast(`${transactionData.type} created successfully!`);
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to create transaction');
    }
  };

  // Vault handlers
  const handleVaultUpdated = async () => {
    // Reload transactions to show the new vault transactions
    await loadTransactions();
    showSuccessToast('Vault updated successfully!');
  };

  const openExpenseModal = () => {
    setInitialActionType('expense');
    setShowSmartAction(true);
  };

  const openIncomeModal = () => {
    setInitialActionType('income');
    setShowSmartAction(true);
  };

  const openTransferModal = () => {
    setInitialActionType('transfer');
    setShowSmartAction(true);
  };

  // Removed legacy spot_buy auto price hook (Quick Add handles simple flows)

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

  // Quick Add helpers (reuse existing toISODateTime defined above for actions)

  type QuickAddData = {
    date: string;
    type: string;
    asset: string;
    account: string;
    quantity: string;
    price_local?: string;
    counterparty?: string;
    tag?: string;
    note?: string;
    internal_flow?: boolean;
  };

  const QuickAddForm: React.FC<{ onCreated: (tx: any) => void }> = ({ onCreated }) => {
    const [qa, setQa] = useState<QuickAddData>({
      date: todayStr,
      type: 'expense',
      asset: 'VND',
      account: '',
      quantity: '',
      price_local: '1',
      counterparty: '',
      tag: '',
      note: '',
      internal_flow: false,
    });
    const [invMode, setInvMode] = useState<'none' | 'stake' | 'unstake'>('none');
    const [invAccount, setInvAccount] = useState('');
    const [invHorizon, setInvHorizon] = useState('');
    const [invOpenOptions, setInvOpenOptions] = useState<Option[]>([]);
    const [invId, setInvId] = useState('');
    const [invIdToInfo, setInvIdToInfo] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);
    const [qaError, setQaError] = useState<string | null>(null);
    const number = (s?: string) => (s ? parseFloat(String(s)) : 0);

    // Adjust defaults when type changes
    useEffect(() => {
      const t = String(qa.type || '').toLowerCase();
      if (t === 'expense' || t === 'fee' || t === 'transfer_in' || t === 'transfer_out' || t === 'deposit' || t === 'withdraw') {
        // Treat as 1:1 local unit
        setQa((prev) => ({ ...prev, asset: prev.asset || 'VND', price_local: '1' }));
      }
    }, [qa.type]);

    // Keyboard shortcuts: n to open (handled outside), esc to close, enter to submit
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (!showQuickAdd) return;
        if (e.key === 'Escape') {
          setShowQuickAdd(false);
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [showQuickAdd]);

    const validate = (): string | null => {
      if (!qa.date) return 'Date is required';
      if (!qa.type) return 'Type is required';
      if (!qa.asset) return 'Asset is required';
      if (!qa.account) return 'Account is required';
      if (!qa.quantity || isNaN(number(qa.quantity)) || number(qa.quantity) <= 0) return 'Valid quantity is required';
      const t = String(qa.type || '').toLowerCase();
      const needsPrice = t === 'buy' || t === 'sell';
      if (needsPrice && (!qa.price_local || isNaN(number(qa.price_local || '')) || number(qa.price_local || '') <= 0)) return 'Valid price is required';
      if (invMode === 'stake') {
        if (!invAccount) return 'Investment account is required';
      }
      if (invMode === 'unstake') {
        if (!invId) return 'Select an active investment';
      }
      return null;
    };

    const submit = async (addAnother: boolean): Promise<void> => {
      const err = validate();
      if (err) {
        setQaError(err);
        return;
      }
      setQaError(null);
      try {
        setSubmitting(true);
        let created: any = null;
        if (invMode === 'stake') {
          // Stake: create an incoming stake via investment API
          const fxUSD = 1;
          const fxVND = 1;
          const amtLocal = number(qa.quantity) * (number(qa.price_local || '1'));
          const amountUSD = amtLocal * fxUSD;
          const amountVND = amtLocal * fxVND;
          const stake = {
            date: toISODateTime(qa.date),
            type: 'stake',
            asset: qa.asset,
            account: invAccount,
            quantity: number(qa.quantity),
            price_local: number(qa.price_local || '1'),
            fx_to_usd: fxUSD,
            fx_to_vnd: fxVND,
            amount_usd: amountUSD,
            amount_vnd: amountVND,
            counterparty: qa.counterparty || null,
            tag: qa.tag || null,
            note: qa.note || null,
            horizon: invHorizon || null,
            investment_id: invId || null,
          };
          await investmentsApi.stake(stake);
          // Quick feedback: reload transactions list minimally
          await loadTransactions();
        } else if (invMode === 'unstake') {
          const info = invIdToInfo[invId] || {};
          const unstakeQty = number(qa.quantity);
          const fxUSD = 1;
          const fxVND = 1;
          const amtLocal = unstakeQty * (number(qa.price_local || '1'));
          const amountUSD = amtLocal * fxUSD;
          const amountVND = amtLocal * fxVND;
          const unstake = {
            date: toISODateTime(qa.date),
            type: 'unstake',
            asset: info.asset || qa.asset,
            account: info.account || invAccount,
            quantity: unstakeQty,
            price_local: number(qa.price_local || '1'),
            fx_to_usd: fxUSD,
            fx_to_vnd: fxVND,
            amount_usd: amountUSD,
            amount_vnd: amountVND,
            counterparty: qa.counterparty || null,
            tag: qa.tag || null,
            note: qa.note || null,
            investment_id: invId,
          };
          await investmentsApi.unstake(unstake);
          await loadTransactions();
        } else {
          // Plain transaction
          const payload: Record<string, any> = {
            date: toISODateTime(qa.date),
            type: qa.type,
            asset: qa.asset,
            account: qa.account,
            quantity: number(qa.quantity),
            price_local: number(qa.price_local || '1'),
            counterparty: qa.counterparty || null,
            tag: qa.tag || null,
            note: qa.note || null,
            fx_to_usd: 0,
            fx_to_vnd: 0,
          };
          created = await transactionApi.create(payload);
          if (created) onCreated(created);
        }
        if (addAnother) {
          // Reset amount fields, keep type/account/asset for speed
          setQa((prev) => ({ ...prev, quantity: '', note: '' }));
        } else {
          setShowQuickAdd(false);
        }
        actions.setError(null);
        showSuccessToast('Transaction created');
      } catch (e: any) {
        setQaError(e?.message ?? 'Failed to create');
        actions.setError(e?.message ?? 'Failed to create');
      } finally {
        setSubmitting(false);
      }
    };

    // Amount preview
    const amountLocal = number(qa.quantity) * (number(qa.price_local || '1'));

    // Load open investments when entering unstake mode
    useEffect(() => {
      const loadOpen = async () => {
        try {
          const list = (await investmentsApi.list({ is_open: true })) as any[];
          const idMap: Record<string, any> = {};
          const options: Option[] = (list || []).map((inv: any) => {
            idMap[String(inv.id)] = inv;
            const dStr = (() => { const d = new Date(inv.deposit_date); return isNaN(d.getTime()) ? String(inv.deposit_date) : d.toISOString().split('T')[0]; })();
            const hz = inv.horizon ? ` [${inv.horizon}]` : '';
            return { value: String(inv.id), label: `${inv.asset} @ ${inv.account}${hz} — ${dStr} — ${inv.remaining_qty} remaining` } as Option;
          });
          setInvIdToInfo(idMap);
          setInvOpenOptions(options);
        } catch {}
      };
      if (invMode === 'unstake') loadOpen();
    }, [invMode]);

    return (
      <div className="bg-white border border-gray-200 rounded-md p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-md font-semibold">Quick Add</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Press Esc to close</span>
            <button
              onClick={() => setShowQuickAdd(false)}
              className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50"
            >Close</button>
          </div>
        </div>

        {qaError && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{qaError}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <DateInput value={qa.date} onChange={(v) => setQa((s) => ({ ...s, date: v }))} />

          <select
            value={qa.type}
            onChange={(e) => setQa((s) => ({ ...s, type: e.target.value }))}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="expense">Expense</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="transfer_in">Transfer In</option>
            <option value="transfer_out">Transfer Out</option>
            <option value="deposit">Deposit</option>
            <option value="withdraw">Withdraw</option>
            <option value="fee">Fee</option>
          </select>

          <ComboBox
            options={(masterData.account || []) as any}
            value={qa.account}
            onChange={(v) => setQa((s) => ({ ...s, account: v }))}
            placeholder="Account"
            allowCreate
            onCreate={async (name) => {
              await adminApi.createAccount({ name, type: 'bank', is_active: true });
              const accounts = await adminApi.listAccounts();
              setMasterData((prev) => ({ ...prev, account: ((accounts as any[]) || []).map((a: any) => ({ value: a.name, label: `${a.name} (${a.type})` })) }));
            }}
          />

          <ComboBox
            options={(masterData.asset || []) as any}
            value={qa.asset}
            onChange={(v) => setQa((s) => ({ ...s, asset: v }))}
            placeholder="Asset"
            allowCreate
            onCreate={async (symbol) => {
              await adminApi.createAsset({ symbol, name: symbol, decimals: 0, is_active: true });
              const assets = await adminApi.listAssets();
              setMasterData((prev) => ({ ...prev, asset: ((assets as any[]) || []).map((a: any) => ({ value: a.symbol, label: `${a.symbol} - ${a.name}` })) }));
            }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <input className="px-3 py-2 border rounded" placeholder="Quantity" type="number" step="any" value={qa.quantity}
            onChange={(e) => setQa((s) => ({ ...s, quantity: e.target.value }))} />
          {(qa.type === 'buy' || qa.type === 'sell') && (
            <input className="px-3 py-2 border rounded" placeholder="Price (Local)" type="number" step="any" value={qa.price_local}
              onChange={(e) => setQa((s) => ({ ...s, price_local: e.target.value }))} />
          )}
          {!(qa.type === 'buy' || qa.type === 'sell') && (
            <input className="px-3 py-2 border rounded bg-gray-50" placeholder="Price (Local)" value={qa.price_local} readOnly />
          )}
        </div>

        {/* Investment section (optional) */}
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-2">
            <label className="text-sm text-gray-700">Investment</label>
            <select className="px-2 py-1 border rounded text-sm" value={invMode} onChange={(e) => setInvMode(e.target.value as any)}>
              <option value="none">None</option>
              <option value="stake">Stake (open/add)</option>
              <option value="unstake">Unstake (close/partial)</option>
            </select>
          </div>
          {invMode === 'stake' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ComboBox
                options={(masterData.account || []) as any}
                value={invAccount}
                onChange={(v) => setInvAccount(String(v))}
                placeholder="Investment Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({ name, type: 'investment', is_active: true });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({ ...prev, account: ((accounts as any[]) || []).map((a: any) => ({ value: a.name, label: `${a.name} (${a.type})` })) }));
                }}
              />
              <select className="px-3 py-2 border rounded" value={invHorizon} onChange={(e) => setInvHorizon(e.target.value)}>
                <option value="">Horizon (optional)</option>
                <option value="short-term">Short-term</option>
                <option value="long-term">Long-term</option>
              </select>
              <input className="px-3 py-2 border rounded" placeholder="Existing Investment ID (optional)" value={invId}
                onChange={(e) => setInvId(e.target.value)} />
            </div>
          )}
          {invMode === 'unstake' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ComboBox
                options={invOpenOptions as any}
                value={invId}
                onChange={(v) => setInvId(String(v))}
                placeholder="Active Investment (required)"
              />
              <input className="px-3 py-2 border rounded" placeholder="Investment Account (optional override)" value={invAccount}
                onChange={(e) => setInvAccount(e.target.value)} />
              <input className="px-3 py-2 border rounded" placeholder="Horizon (optional override)" value={invHorizon}
                onChange={(e) => setInvHorizon(e.target.value)} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <ComboBox
            options={(masterData.tag || []) as any}
            value={qa.tag || ''}
            onChange={(v) => setQa((s) => ({ ...s, tag: v }))}
            placeholder="Tag (optional)"
            allowCreate
            onCreate={async (name) => {
              await adminApi.createTag({ name, category: 'General', is_active: true });
              const tags = await adminApi.listTags();
              setMasterData((prev) => ({ ...prev, tag: ((tags as any[]) || []).map((t: any) => ({ value: t.name, label: `${t.name} (${t.category})` })) }));
            }}
          />
          <input className="px-3 py-2 border rounded" placeholder="Counterparty (optional)" value={qa.counterparty}
            onChange={(e) => setQa((s) => ({ ...s, counterparty: e.target.value }))} />
          <input className="px-3 py-2 border rounded" placeholder="Note (optional)" value={qa.note}
            onChange={(e) => setQa((s) => ({ ...s, note: e.target.value }))} />
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">Amount (Local): <span className="font-semibold">{amountLocal ? amountLocal.toLocaleString() : '0'}</span></div>
          <div className="flex items-center gap-2">
            <button
              className={`px-4 py-2 text-sm rounded-md text-white ${submitting ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
              onClick={() => submit(false)}
              disabled={submitting}
            >Add</button>
            <button
              className={`px-4 py-2 text-sm rounded-md border ${submitting ? 'bg-gray-100' : 'bg-white hover:bg-gray-50'}`}
              onClick={() => submit(true)}
              disabled={submitting}
            >Add & New</button>
            <button
              className="px-4 py-2 text-sm rounded-md border bg-white hover:bg-gray-50"
              onClick={() => { setShowForm(true); setShowQuickAdd(false); }}
            >Advanced…</button>
          </div>
        </div>
      </div>
    );
  };

  // Removed legacy Quick Actions in favor of simplified Quick Add

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
      const msg = err?.message ?? 'Failed to create transaction.';
      actions.setError(msg);
      showErrorToast(msg);
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
      const msg = err?.message ?? 'Failed to update transaction.';
      actions.setError(msg);
      showErrorToast(msg);
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

  const handleDeleteSelected = async (): Promise<void> => {
    const ids = Array.from(selectedIds).map(String);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected transaction(s)?`)) return;
    try {
      const res = await transactionApi.deleteMany(ids);
      const deleted = (res as any)?.deleted ?? ids.length;
      setTransactions((prev) => prev.filter((tx) => !selectedIds.has(tx.id)));
      setSelectedIds(new Set());
      actions.setError(null);
      showSuccessToast(`Deleted ${deleted} transaction(s)`);
    } catch (err: any) {
      actions.setError(err?.message ?? 'Unknown error');
      showErrorToast('Failed to delete selected. Please try again.');
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
            {/* Smart Action Buttons */}
            <div className="flex space-x-2">
              <button
                onClick={openExpenseModal}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-500 hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                title="Add Expense (press N)"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Expense
              </button>
              <button
                onClick={openIncomeModal}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-500 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                title="Add Income"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Income
              </button>
              <button
                onClick={openTransferModal}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                title="Transfer Money"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transfer
              </button>
            </div>
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
              onClick={handleDeleteSelected}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${selectedIds.size > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-400 cursor-not-allowed'}`}
              disabled={selectedIds.size === 0}
              title={selectedIds.size === 0 ? 'Select rows to delete' : 'Delete selected'}
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-9 0h10" />
              </svg>
              Delete Selected
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

      {/* Smart Action Modal */}
      <SmartActionModal
        isOpen={showSmartAction}
        onClose={() => setShowSmartAction(false)}
        onSubmit={handleSmartActionSubmit}
        initialType={initialActionType}
      />

      {/* Currency Toggle */}
      <div className="mb-6">
        <div className="inline-flex rounded-md shadow-sm">
          <button
            onClick={() => actions.setCurrency('USD')}
            className={`px-4 py-2 text-sm font-medium border rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${currency === 'USD'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
          >
            USD View
          </button>
          <button
            onClick={() => actions.setCurrency('VND')}
            className={`px-4 py-2 text-sm font-medium border-t border-b border-r rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${currency === 'VND'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
          >
            VND View
          </button>
        </div>
      </div>

      {/* Quick Actions removed */}

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
        selectableRows={true}
        selectedIds={selectedIds as any}
        onToggleRow={(id, checked) => {
          setSelectedIds((s) => {
            const next = new Set(s);
            if (checked) next.add(id as IdType); else next.delete(id as IdType);
            return next;
          });
        }}
        onToggleAll={(checked, visibleIds) => {
          setSelectedIds((s) => {
            const next = new Set(s);
            for (const id of visibleIds) {
              if (checked) next.add(id as IdType); else next.delete(id as IdType);
            }
            return next;
          });
        }}
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

      {/* Vault Manager Button */}
      <FastInvestmentButton onVaultUpdated={handleVaultUpdated} />
    </div>
  );
};

export default TransactionPage;
