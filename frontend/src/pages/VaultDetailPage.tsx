import { format } from 'date-fns';
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import ComboBox from '../components/ui/ComboBox';
import DataTable from '../components/ui/DataTable';
import DateInput from '../components/ui/DateInput';
import { useToast } from '../components/ui/Toast';
import { useBackendStatus } from '../context/BackendStatusContext';
import { vaultApi, investmentsApi } from '../services/api';
import { formatCurrency, formatPercentage, formatPnL, getDecimalPlaces } from '../utils/currencyFormatter';

type Vault = {
  id: string;
  is_vault: boolean;
  vault_name?: string;
  vault_status?: string;
  vault_ended_at?: string;
  asset: string;
  account: string;
  horizon?: string;
  deposit_date: string;
  deposit_qty: string;
  deposit_cost: string;
  deposit_unit_cost: string;
  withdrawal_qty: string;
  withdrawal_value: string;
  withdrawal_unit_price: string;
  pnl: string;
  pnl_percent: string;
  is_open: boolean;
  realized_pnl: string;
  remaining_qty: string;
  created_at: string;
  updated_at: string;
};

type Transaction = {
  id: string;
  date: string;
  type: string;
  asset: string;
  account: string;
  quantity: string;
  amount_usd: number;
  amount_vnd: number;
  counterparty?: string;
  tag?: string;
  note?: string;
  investment_id?: string;
};

type Option = { value: string; label: string };
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

const VaultDetailPage: React.FC = () => {
  const { vaultName } = useParams<{ vaultName: string }>();
  const navigate = useNavigate();
  const { isOnline } = useBackendStatus() as unknown as { isOnline: boolean };
  const { error: showErrorToast, success: showSuccessToast } =
    useToast() as unknown as {
      error: (m: string) => void;
      success: (m: string) => void;
    };

  const [vault, setVault] = useState<Vault | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showDepositForm, setShowDepositForm] = useState<boolean>(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<Option[]>([]);

  // Form states
  const [depositForm, setDepositForm] = useState({
    quantity: '',
    cost: '',
    sourceAccount: '',
  });

  const [withdrawForm, setWithdrawForm] = useState({
    quantity: '',
    value: '',
    targetAccount: '',
  });
  const [withdrawPercent, setWithdrawPercent] = useState<string>('');

  useEffect(() => {
    if (vaultName) {
      loadVault();
      loadVaultTransactions();
      loadAccounts();
    }
  }, [vaultName]);

  const loadVault = async () => {
    try {
      setLoading(true);
      const vaultData = await vaultApi.getVaultByName(vaultName!);
      setVault(vaultData as Vault);
    } catch (err: any) {
      setError(err?.message || 'Failed to load vault');
      showErrorToast('Failed to load vault details');
    } finally {
      setLoading(false);
    }
  };

  const loadVaultTransactions = async () => {
    try {
      // Load transactions related to this vault
      const txs = await investmentsApi.list({ investment_id: vaultName }) as any[];
      setTransactions(txs || []);
    } catch (err: any) {
      console.error('Failed to load vault transactions:', err);
    }
  };

  const loadAccounts = async () => {
    try {
      // This would come from admin API in a real implementation
      const mockAccounts = [
        { value: 'Cash - VND', label: 'Cash - VND (bank)' },
        { value: 'Cash - USD', label: 'Cash - USD (bank)' },
        { value: 'Binance', label: 'Binance (exchange)' },
        { value: 'Coinbase', label: 'Coinbase (exchange)' },
      ];
      setAccounts(mockAccounts);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  };

  const handleDeposit = async () => {
    if (!depositForm.quantity || !depositForm.cost) {
      showErrorToast('Please enter quantity and cost');
      return;
    }

    try {
      await vaultApi.depositToVault(vaultName!, {
        quantity: parseFloat(depositForm.quantity),
        cost: parseFloat(depositForm.cost),
        ...(depositForm.sourceAccount ? { sourceAccount: depositForm.sourceAccount } : {}),
      });

      showSuccessToast('Deposit successful!');
      setShowDepositForm(false);
      setDepositForm({ quantity: '', cost: '', sourceAccount: '' });

      // Reload vault data and transactions
      await loadVault();
      await loadVaultTransactions();
    } catch (err: any) {
      showErrorToast(err?.message || 'Failed to process deposit');
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawForm.quantity || !withdrawForm.value) {
      showErrorToast('Please enter quantity and value');
      return;
    }

    try {
      await vaultApi.withdrawFromVault(vaultName!, {
        quantity: parseFloat(withdrawForm.quantity),
        value: parseFloat(withdrawForm.value),
        ...(withdrawForm.targetAccount ? { targetAccount: withdrawForm.targetAccount } : {}),
      });

      showSuccessToast('Withdrawal successful!');
      setShowWithdrawForm(false);
      setWithdrawForm({ quantity: '', value: '', targetAccount: '' });

      // Reload vault data and transactions
      await loadVault();
      await loadVaultTransactions();
    } catch (err: any) {
      showErrorToast(err?.message || 'Failed to process withdrawal');
    }
  };

  const handleEndVault = async () => {
    if (!confirm('Are you sure you want to end this vault? This will mark it as closed.')) {
      return;
    }

    try {
      await vaultApi.endVault(vaultName!);
      showSuccessToast('Vault ended successfully!');
      await loadVault();
      await loadVaultTransactions();
    } catch (err: any) {
      showErrorToast(err?.message || 'Failed to end vault');
    }
  };

  const handleDeleteVault = async () => {
    if (!confirm('Delete this vault permanently? This cannot be undone.')) {
      return;
    }
    try {
      await vaultApi.deleteVault(vaultName!);
      showSuccessToast('Vault deleted successfully!');
      navigate('/vaults');
    } catch (err: any) {
      showErrorToast(err?.message || 'Failed to delete vault');
    }
  };

  const formatVaultNumber = (value: string | number, decimals: number = 2): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const vaultColumns: Column[] = [
    {
      key: 'created_at',
      title: 'Created',
      type: 'date',
    },
    {
      key: 'deposit_date',
      title: 'First Deposit',
      type: 'date',
    },
    {
      key: 'deposit_qty',
      title: 'Total Deposited',
      type: 'number',
      decimals: 8,
      render: (value: any, column: any, row: any) => {
        const qty = parseFloat(value || '0');
        const decimals = getDecimalPlaces(row.asset || 'USD');
        return formatVaultNumber(qty, decimals);
      },
    },
    {
      key: 'deposit_cost',
      title: 'Total Cost',
      type: 'currency',
      currency: 'USD',
      render: (value: any) => formatCurrency(parseFloat(value || '0'), 'USD'),
    },
    {
      key: 'remaining_qty',
      title: 'Remaining Balance',
      type: 'number',
      decimals: 8,
      render: (value: any, column: any, row: any) => {
        const qty = parseFloat(value || '0');
        const decimals = getDecimalPlaces(row.asset || 'USD');
        return formatVaultNumber(qty, decimals);
      },
    },
    {
      key: 'pnl',
      title: 'Realized P&L',
      type: 'currency',
      currency: 'USD',
      render: (value: any, _column: any, row: any) => {
        const pnl = parseFloat(value || '0');
        const formattedPnL = formatPnL(pnl, 'USD');
        return <span className={formattedPnL.colorClass}>{formattedPnL.sign}{formattedPnL.value}</span>;
      },
    },
    {
      key: 'pnl_percent',
      title: 'ROI %',
      type: 'number',
      decimals: 2,
      render: (value: any, _column: any, row: any) => {
        const roi = parseFloat(value || '0');
        const isPositive = roi > 0;
        const className = isPositive ? 'text-green-700' : roi < 0 ? 'text-red-700' : 'text-gray-700';
        return <span className={className}>{formatPercentage(roi / 100, 2)}</span>;
      },
    },
    {
      key: 'vault_status',
      title: 'Status',
      render: (value: any) => {
        const status = String(value || '').toLowerCase();
        const statusConfig = {
          active: { label: 'Active', class: 'bg-green-100 text-green-800' },
          ended: { label: 'Ended', class: 'bg-red-100 text-red-800' },
          closed: { label: 'Closed', class: 'bg-gray-100 text-gray-800' },
        };
        const config = statusConfig[status as keyof typeof statusConfig] || { label: status, class: 'bg-gray-100 text-gray-800' };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.class}`}>
            {config.label}
          </span>
        );
      },
    },
  ];

  const transactionColumns: Column[] = [
    {
      key: 'date',
      title: 'Date',
      type: 'date',
    },
    {
      key: 'type',
      title: 'Type',
      render: (value: any) => {
        const type = String(value || '').toLowerCase();
        const typeConfig = {
          deposit: { label: 'Deposit', class: 'bg-green-100 text-green-800' },
          withdrawal: { label: 'Withdrawal', class: 'bg-red-100 text-red-800' },
          stake: { label: 'Stake', class: 'bg-blue-100 text-blue-800' },
          unstake: { label: 'Unstake', class: 'bg-purple-100 text-purple-800' },
        };
        const config = typeConfig[type as keyof typeof typeConfig] || { label: type, class: 'bg-gray-100 text-gray-800' };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.class}`}>
            {config.label}
          </span>
        );
      },
    },
    {
      key: 'asset',
      title: 'Asset',
    },
    {
      key: 'quantity',
      title: 'Quantity',
      type: 'number',
      decimals: 8,
    },
    {
      key: 'amount_usd',
      title: 'Amount (USD)',
      type: 'currency',
      currency: 'USD',
    },
    {
      key: 'counterparty',
      title: 'Source/Target',
    },
    {
      key: 'note',
      title: 'Note',
    },
  ];

  const isUsdOnlyVault = useMemo(() => {
    return (vault?.asset || '').toUpperCase() === 'USD';
  }, [vault]);

  useEffect(() => {
    // When opening deposit form for USD vault, default qty to 1
    if (isUsdOnlyVault && showDepositForm) {
      setDepositForm((s) => ({ ...s, quantity: s.quantity || '1' }));
    }
  }, [isUsdOnlyVault, showDepositForm]);

  const onChangeWithdrawPercent = (val: string) => {
    setWithdrawPercent(val);
    const pct = parseFloat(val || '');
    const rem = parseFloat(vault?.remaining_qty || '0');
    if (!isNaN(pct) && !isNaN(rem)) {
      const qty = Math.max(0, Math.min(100, pct)) / 100 * rem;
      setWithdrawForm((s) => ({ ...s, quantity: String(qty) }));
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error || !vault) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Vault Not Found</h1>
          <p className="text-gray-600 mb-4">{error || 'The requested vault could not be found.'}</p>
          <button
            onClick={() => navigate('/vaults')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Vaults
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0" data-testid="vault-detail-page">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/vaults')}
          className="mb-4 text-blue-600 hover:text-blue-800 flex items-center"
        >
          ← Back to Vaults
        </button>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {vault.vault_name || vaultName}
        </h1>
        <p className="text-gray-600">
          Vault Details - {vault.asset} @ {vault.account}
          {vault.horizon && ` [${vault.horizon}]`}
        </p>
      </div>

      {/* Vault Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Deposited</h3>
          <p className="text-2xl font-bold text-gray-900">{formatVaultNumber(vault.deposit_qty, 8)} {vault.asset}</p>
          <p className="text-sm text-gray-600">{formatCurrency(vault.deposit_cost)}</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Current Balance</h3>
          <p className="text-2xl font-bold text-gray-900">{formatVaultNumber(vault.remaining_qty, 8)} {vault.asset}</p>
          <p className="text-sm text-gray-600">Remaining in vault</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Realized P&L</h3>
          <p className={`text-2xl font-bold ${parseFloat(vault.pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(vault.pnl)}
          </p>
          <p className="text-sm text-gray-600">{formatVaultNumber(vault.pnl_percent, 2)}% ROI</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Vault Status</h3>
          <p className="text-lg font-medium text-gray-900 capitalize">{vault.vault_status || 'Unknown'}</p>
          <p className="text-sm text-gray-600">
            Created: {format(new Date(vault.created_at), 'MMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3 mb-6">
        <button
          onClick={() => setShowDepositForm(!showDepositForm)}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          disabled={!vault.is_open}
        >
          Deposit to Vault
        </button>
        <button
          onClick={() => setShowWithdrawForm(!showWithdrawForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          disabled={!vault.is_open}
        >
          Withdraw from Vault
        </button>
        {vault.is_open && (
          <button
            onClick={handleEndVault}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            End Vault
          </button>
        )}
        <button
          onClick={handleDeleteVault}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Delete Vault
        </button>
      </div>

      {/* Deposit Form */}
      {showDepositForm && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
          <h3 className="text-lg font-semibold mb-4">Deposit to Vault</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {isUsdOnlyVault ? (
              <div className="px-3 py-2 border rounded-md bg-gray-50 text-gray-700 flex items-center">Quantity fixed to 1</div>
            ) : (
              <input
                type="number"
                step="any"
                placeholder="Quantity"
                value={depositForm.quantity}
                onChange={(e) => setDepositForm({ ...depositForm, quantity: e.target.value })}
                className="px-3 py-2 border rounded-md"
              />
            )}
            <input
              type="number"
              step="any"
              placeholder="Cost (USD)"
              value={depositForm.cost}
              onChange={(e) => setDepositForm({ ...depositForm, cost: e.target.value })}
              className="px-3 py-2 border rounded-md"
            />
            <ComboBox
              options={accounts}
              value={depositForm.sourceAccount}
              onChange={(value) => setDepositForm({ ...depositForm, sourceAccount: value })}
              placeholder="Source Account (optional)"
            />
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleDeposit}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Deposit
            </button>
            <button
              onClick={() => setShowDepositForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Withdraw Form */}
      {showWithdrawForm && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
          <h3 className="text-lg font-semibold mb-4">Withdraw from Vault</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {isUsdOnlyVault ? (
              <>
                <input
                  type="number"
                  step="any"
                  placeholder="Withdraw % of remaining"
                  value={withdrawPercent}
                  onChange={(e) => onChangeWithdrawPercent(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Quantity (auto)"
                  value={withdrawForm.quantity}
                  readOnly
                  className="px-3 py-2 border rounded-md bg-gray-50"
                />
              </>
            ) : (
              <input
                type="number"
                step="any"
                placeholder="Quantity"
                value={withdrawForm.quantity}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, quantity: e.target.value })}
                className="px-3 py-2 border rounded-md"
              />
            )}
            <input
              type="number"
              step="any"
              placeholder="Value (USD)"
              value={withdrawForm.value}
              onChange={(e) => setWithdrawForm({ ...withdrawForm, value: e.target.value })}
              className="px-3 py-2 border rounded-md"
            />
            <ComboBox
              options={accounts}
              value={withdrawForm.targetAccount}
              onChange={(value) => setWithdrawForm({ ...withdrawForm, targetAccount: value })}
              placeholder="Target Account (optional)"
            />
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleWithdraw}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Withdraw
            </button>
            <button
              onClick={() => setShowWithdrawForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Vault Details Table */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Vault Details</h2>
        <DataTable
          data={[vault]}
          columns={vaultColumns}
          loading={false}
          error={null}
          emptyMessage="No vault data available"
          editable={false}
          selectableRows={false}
          data-testid="vault-details-table"
        />
      </div>

      {/* Vault Transactions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Vault Transactions</h2>
        <DataTable
          data={transactions}
          columns={transactionColumns}
          loading={false}
          error={null}
          emptyMessage="No transactions found for this vault"
          editable={false}
          selectableRows={false}
          data-testid="vault-transactions-table"
        />
      </div>
    </div>
  );
};

export default VaultDetailPage;