import React, { useState, useEffect } from 'react';
import { transactionApi, adminApi } from '../services/api';
import { useApp } from '../context/AppContext';
import { useBackendStatus } from '../context/BackendStatusContext';
import { useToast } from '../components/ui/Toast';
import TransactionForm from '../components/TransactionForm';
import DataTable from '../components/ui/DataTable';

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
