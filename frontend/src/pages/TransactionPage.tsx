import React, { useState, useEffect, useMemo } from 'react';

import TransactionForm from '../components/TransactionForm';
import DataTable from '../components/ui/DataTable';
import DateInput from '../components/ui/DateInput';
import ComboBox from '../components/ui/ComboBox';
import { useToast } from '../components/ui/Toast';
import { useApp } from '../context/AppContext';
import { useBackendStatus } from '../context/BackendStatusContext';
import { transactionApi, adminApi, actionsApi } from '../services/api';

const TransactionPage = () => {
  const { currency, actions } = useApp();
  const { isOnline } = useBackendStatus();
  const { error: showErrorToast, success: showSuccessToast } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [filters, setFilters] = useState({});
  const [masterData, setMasterData] = useState({});
  const [performing, setPerforming] = useState(false);
  const [actionForm, setActionForm] = useState({
    action: '',
    params: {},
  });

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Load transactions and master data on mount
  useEffect(() => {
    loadTransactions();
    loadMasterData();
  }, [filters]);

  const loadMasterData = async () => {
    try {
      const [types, accounts, assets, tags] = await Promise.all([
        adminApi.listTypes(),
        adminApi.listAccounts(),
        adminApi.listAssets(),
        adminApi.listTags(),
      ]);

      setMasterData({
        type: types.map((t) => ({
          value: t.name,
          label: t.description || t.name,
        })),
        account: accounts.map((a) => ({
          value: a.name,
          label: `${a.name} (${a.type})`,
        })),
        asset: assets.map((a) => ({
          value: a.symbol,
          label: `${a.symbol} - ${a.name}`,
        })),
        tag: tags.map((t) => ({
          value: t.name,
          label: `${t.name} (${t.category})`,
        })),
        counterparty: [], // This could be populated from recent counterparties
      });
      console.log('Master data loaded:', { types, accounts, assets, tags });
    } catch (err) {
      console.error('Failed to load master data:', err);
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await transactionApi.list(filters);
      setTransactions(data || []);
    } catch (err) {
      setError(err);
      actions.setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePerformAction = async () => {
    if (!actionForm.action) {
      showErrorToast('Please select an action');
      return;
    }
    try {
      setPerforming(true);
      const resp = await actionsApi.perform(actionForm.action, actionForm.params);
      const created = resp?.transactions || [];
      if (created.length > 0) {
        setTransactions((prev) => [...created, ...prev]);
      } else {
        await loadTransactions();
      }
      showSuccessToast('Action performed successfully');
      setActionForm({ action: '', params: {} });
    } catch (err) {
      actions.setError(err.message);
      showErrorToast('Failed to perform action');
    } finally {
      setPerforming(false);
    }
  };

  const handleCreateTransaction = async (transactionData) => {
    try {
      const newTransaction = await transactionApi.create(transactionData);
      setTransactions((prev) => [newTransaction, ...prev]);
      setShowForm(false);
      actions.setError(null);
      showSuccessToast('Transaction created successfully');
    } catch (err) {
      actions.setError(err.message);
      showErrorToast('Failed to create transaction. Please try again.');
    }
  };

  const handleUpdateTransaction = async (transactionData) => {
    try {
      const updatedTransaction = await transactionApi.update(
        editingTransaction.id,
        transactionData
      );
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.id === editingTransaction.id ? updatedTransaction : tx
        )
      );
      setEditingTransaction(null);
      setShowForm(false);
      actions.setError(null);
      showSuccessToast('Transaction updated successfully');
    } catch (err) {
      actions.setError(err.message);
      showErrorToast('Failed to update transaction. Please try again.');
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    try {
      await transactionApi.delete(id);
      setTransactions((prev) => prev.filter((tx) => tx.id !== id));
      actions.setError(null);
      showSuccessToast('Transaction deleted successfully');
    } catch (err) {
      actions.setError(err.message);
      showErrorToast('Failed to delete transaction. Please try again.');
    }
  };

  const handleEditClick = (transaction) => {
    setEditingTransaction(transaction);
    setShowForm(true);
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingTransaction(null);
  };

  const handleInlineEdit = async (transactionId, field, newValue) => {
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
      const updatedTransaction = { ...transaction, [field]: newValue };
      setTransactions((prev) =>
        prev.map((t) => (t.id === transactionId ? updatedTransaction : t))
      );

      // Make API call to persist changes
      const updateData = { [field]: newValue };
      await transactionApi.update(transactionId, updateData);

      actions.setError(null);
      showSuccessToast(`${field} updated successfully`);
    } catch (err) {
      console.error('Inline edit error:', err);
      actions.setError(`Failed to update ${field}: ${err.message}`);
      showErrorToast(`Failed to update ${field}. Please try again.`);
      // Reload transactions to revert any optimistic updates
      loadTransactions();
    }
  };

  const columns = [
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
      formatter: (value) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            ['buy', 'income', 'reward'].includes(value)
              ? 'bg-green-100 text-green-800'
              : ['sell', 'expense', 'fee'].includes(value)
                ? 'bg-red-100 text-red-800'
                : 'bg-gray-100 text-gray-800'
          }`}
        >
          {value}
        </span>
      ),
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
    },
    {
      key: currency === 'USD' ? 'cashflow_usd' : 'cashflow_vnd',
      title: `Cash Flow (${currency})`,
      type: 'currency',
      currency: currency,
      formatter: (value) => (
        <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
          {new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
          }).format(value)}
        </span>
      ),
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
          transaction={editingTransaction}
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
              Track your financial transactions with dual currency valuation and comprehensive reporting.
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
        <h3 className="text-md font-semibold mb-3">Predefined Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Action</label>
            <select
              className="w-full px-3 py-2 border rounded-md"
              value={actionForm.action}
              onChange={(e) => setActionForm({ action: e.target.value, params: {} })}
            >
              <option value="">Select an action</option>
              <option value="init_balance">Init Balance (seed existing holding)</option>
              <option value="p2p_buy_usdt">P2P: Buy USDT with VND</option>
              <option value="p2p_sell_usdt">P2P: Sell USDT for VND</option>
              <option value="spend_vnd">Spend VND (daily)</option>
              <option value="credit_spend_vnd">Spend VND (credit card)</option>
              <option value="spot_buy">Spot Buy (pay with quote)</option>
              <option value="borrow">Borrow</option>
              <option value="repay_borrow">Repay Borrow</option>
              <option value="stake">Stake (investment)</option>
              <option value="unstake">Unstake (investment)</option>
            </select>
          </div>

          {/* Dynamic params */}
          {actionForm.action === 'p2p_buy_usdt' || actionForm.action === 'p2p_sell_usdt' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, date:v}}))}
              />
              <ComboBox
                options={(masterData.account || [])}
                value={actionForm.params.bank_account || ''}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, bank_account:v}}))}
                placeholder="Bank Account"
                allowCreate
                onCreate={async (name)=>{ await adminApi.createAccount({ name, type:'bank', is_active:true }); const accounts = await adminApi.listAccounts(); setMasterData((prev)=>({ ...prev, account: (accounts||[]).map((a)=>({ value:a.name, label:`${a.name} (${a.type})`})) })); }}
              />
              <ComboBox
                options={(masterData.account || [])}
                value={actionForm.params.exchange_account || ''}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, exchange_account:v}}))}
                placeholder="Exchange Account"
                allowCreate
                onCreate={async (name)=>{ await adminApi.createAccount({ name, type:'exchange', is_active:true }); const accounts = await adminApi.listAccounts(); setMasterData((prev)=>({ ...prev, account: (accounts||[]).map((a)=>({ value:a.name, label:`${a.name} (${a.type})`})) })); }}
              />
              <input className="px-3 py-2 border rounded" placeholder="VND Amount" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, vnd_amount:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Price VND per USDT" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, price_vnd_per_usdt:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Fee VND (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, fee_vnd:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Counterparty (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, counterparty:e.target.value}}))} />
            </div>
          ) : null}

          {actionForm.action === 'spend_vnd' || actionForm.action === 'credit_spend_vnd' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, date:v}}))}
              />
              <ComboBox
                options={(masterData.account || [])}
                value={actionForm.params.account || ''}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, account:v}}))}
                placeholder="Account (Bank/CreditCard)"
                allowCreate
                onCreate={async (name)=>{ await adminApi.createAccount({ name, type:'bank', is_active:true }); const accounts = await adminApi.listAccounts(); setMasterData((prev)=>({ ...prev, account: (accounts||[]).map((a)=>({ value:a.name, label:`${a.name} (${a.type})`})) })); }}
              />
              <input className="px-3 py-2 border rounded" placeholder="VND Amount" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, vnd_amount:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Counterparty" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, counterparty:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Tag" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, tag:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Note" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, note:e.target.value}}))} />
            </div>
          ) : null}

          {actionForm.action === 'init_balance' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, date:v}}))}
              />
              <ComboBox
                options={(masterData.account || [])}
                value={actionForm.params.account || ''}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, account:v}}))}
                placeholder="Account"
                allowCreate
                onCreate={async (name)=>{ await adminApi.createAccount({ name, type:'bank', is_active:true }); const accounts = await adminApi.listAccounts(); setMasterData((prev)=>({ ...prev, account: (accounts||[]).map((a)=>({ value:a.name, label:`${a.name} (${a.type})`})) })); }}
              />
              <ComboBox
                options={(masterData.asset || [])}
                value={actionForm.params.asset || ''}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, asset:v}}))}
                placeholder="Asset"
              />
              <input className="px-3 py-2 border rounded" placeholder="Quantity" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, quantity:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Price Local (default 1)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, price_local:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="FX to USD (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, fx_to_usd:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="FX to VND (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, fx_to_vnd:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Tag (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, tag:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Note (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, note:e.target.value}}))} />
            </div>
          ) : null}

          {actionForm.action === 'spot_buy' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, date:v}}))}
              />
              <ComboBox
                options={(masterData.account || [])}
                value={actionForm.params.exchange_account || ''}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, exchange_account:v}}))}
                placeholder="Exchange Account"
                allowCreate
                onCreate={async (name)=>{ await adminApi.createAccount({ name, type:'exchange', is_active:true }); const accounts = await adminApi.listAccounts(); setMasterData((prev)=>({ ...prev, account: (accounts||[]).map((a)=>({ value:a.name, label:`${a.name} (${a.type})`})) })); }}
              />
              <input className="px-3 py-2 border rounded" placeholder="Base Asset (e.g., BTC)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, base_asset:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Quote Asset (e.g., USDT)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, quote_asset:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Quantity (base)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, quantity:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Price (quote)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, price_quote:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Fee (quote) optional" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, fee_quote:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Counterparty (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, counterparty:e.target.value}}))} />
            </div>
          ) : null}

          {actionForm.action === 'borrow' || actionForm.action === 'repay_borrow' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, date:v}}))}
              />
              <ComboBox
                options={(masterData.account || [])}
                value={actionForm.params.account || ''}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, account:v}}))}
                placeholder="Account"
                allowCreate
                onCreate={async (name)=>{ await adminApi.createAccount({ name, type:'bank', is_active:true }); const accounts = await adminApi.listAccounts(); setMasterData((prev)=>({ ...prev, account: (accounts||[]).map((a)=>({ value:a.name, label:`${a.name} (${a.type})`})) })); }}
              />
              <input className="px-3 py-2 border rounded" placeholder="Asset" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, asset:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Amount" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, amount:e.target.value}}))} />
              {actionForm.action === 'repay_borrow' && (
                <input className="px-3 py-2 border rounded" placeholder="Borrow Tx ID (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, borrow_id:e.target.value}}))} />
              )}
              <input className="px-3 py-2 border rounded" placeholder="Counterparty (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, counterparty:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Note (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, note:e.target.value}}))} />
            </div>
          ) : null}

          {actionForm.action === 'stake' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, date:v}}))}
              />
              <ComboBox
                options={(masterData.account || [])}
                value={actionForm.params.source_account || ''}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, source_account:v}}))}
                placeholder="Source Account"
                allowCreate
                onCreate={async (name)=>{ await adminApi.createAccount({ name, type:'bank', is_active:true }); const accounts = await adminApi.listAccounts(); setMasterData((prev)=>({ ...prev, account: (accounts||[]).map((a)=>({ value:a.name, label:`${a.name} (${a.type})`})) })); }}
              />
              <ComboBox
                options={(masterData.account || [])}
                value={actionForm.params.investment_account || ''}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, investment_account:v}}))}
                placeholder="Investment Account"
                allowCreate
                onCreate={async (name)=>{ await adminApi.createAccount({ name, type:'investment', is_active:true }); const accounts = await adminApi.listAccounts(); setMasterData((prev)=>({ ...prev, account: (accounts||[]).map((a)=>({ value:a.name, label:`${a.name} (${a.type})`})) })); }}
              />
              <input className="px-3 py-2 border rounded" placeholder="Asset" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, asset:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Amount" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, amount:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Fee % (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, fee_percent:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Horizon 'short-term'|'long-term' (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, horizon:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Tag (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, tag:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Counterparty (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, counterparty:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Note (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, note:e.target.value}}))} />
            </div>
          )}

          {actionForm.action === 'unstake' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DateInput
                className="w-full"
                value={actionForm.params.date || todayStr}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, date:v}}))}
              />
              <ComboBox
                options={(masterData.account || [])}
                value={actionForm.params.investment_account || ''}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, investment_account:v}}))}
                placeholder="Investment Account"
                allowCreate
                onCreate={async (name)=>{ await adminApi.createAccount({ name, type:'investment', is_active:true }); const accounts = await adminApi.listAccounts(); setMasterData((prev)=>({ ...prev, account: (accounts||[]).map((a)=>({ value:a.name, label:`${a.name} (${a.type})`})) })); }}
              />
              <ComboBox
                options={(masterData.account || [])}
                value={actionForm.params.destination_account || ''}
                onChange={(v)=>setActionForm(s=>({ ...s, params:{...s.params, destination_account:v}}))}
                placeholder="Destination Account"
                allowCreate
                onCreate={async (name)=>{ await adminApi.createAccount({ name, type:'bank', is_active:true }); const accounts = await adminApi.listAccounts(); setMasterData((prev)=>({ ...prev, account: (accounts||[]).map((a)=>({ value:a.name, label:`${a.name} (${a.type})`})) })); }}
              />
              <input className="px-3 py-2 border rounded" placeholder="Asset" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, asset:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Amount" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, amount:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Stake Deposit Tx ID (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, stake_deposit_tx_id:e.target.value}}))} />
              <input className="px-3 py-2 border rounded" placeholder="Note (optional)" onChange={(e)=>setActionForm(s=>({ ...s, params:{...s.params, note:e.target.value}}))} />
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
        data={transactions}
        columns={columns}
        loading={loading}
        error={error}
        emptyMessage="No transactions found. Create your first transaction above."
        editable={true}
        onCellEdit={handleInlineEdit}
        masterData={masterData}
        onRowClick={null} // Disable row click when inline editing is enabled
        actions={['edit', 'delete']}
        onEdit={handleEditClick}
        onDelete={handleDeleteTransaction}
      />
    </div>
  );
};

export default TransactionPage;
