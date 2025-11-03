import { format } from 'date-fns';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import ComboBox from '../components/ui/ComboBox';
import DataTable, { TableColumn } from '../components/ui/DataTable';
import { useToast } from '../components/ui/Toast';
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

type ManualMetrics = {
  as_of?: string;
  current_value_usd?: number;
  roi_realtime_percent?: number;
  apr_percent?: number;
  benchmark_asset?: string;
  benchmark_roi_percent?: number;
  benchmark_apr_percent?: number;
};

const VaultDetailPage: React.FC = () => {
  const { vaultName } = useParams<{ vaultName: string }>();
  const navigate = useNavigate();
  const { error: showErrorToast, success: showSuccessToast } = useToast();

  const [vault, setVault] = useState<Vault | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showDepositForm, setShowDepositForm] = useState<boolean>(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [manualMetrics, setManualMetrics] = useState<ManualMetrics | null>(null);

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

  const loadVault = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      if (!vaultName) return;
      const vaultData = await vaultApi.getVaultByName<Vault>(vaultName);
      setVault(vaultData ?? null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load vault';
      setError(message);
      showErrorToast('Failed to load vault details');
    } finally {
      setLoading(false);
    }
  }, [vaultName, showErrorToast]);

  const loadVaultTransactions = useCallback(async (): Promise<void> => {
    try {
      // Load transactions related to this vault
      if (!vaultName) return;
      const txs = await investmentsApi.list<Transaction[]>({ investment_id: vaultName });
      setTransactions(Array.isArray(txs) ? txs : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to load vault transactions:', message);
    }
  }, [vaultName]);

  const loadAccounts = (): void => {
    // This would come from admin API in a real implementation
    const mockAccounts: Option[] = [
      { value: 'Cash - VND', label: 'Cash - VND (bank)' },
      { value: 'Cash - USD', label: 'Cash - USD (bank)' },
      { value: 'Binance', label: 'Binance (exchange)' },
      { value: 'Coinbase', label: 'Coinbase (exchange)' },
    ];
    setAccounts(mockAccounts);
  };

  useEffect(() => {
    if (vaultName) {
      void loadVault();
      void loadVaultTransactions();
      loadAccounts();
    }
  }, [vaultName, loadVault, loadVaultTransactions]);

  const handleDeposit = async (): Promise<void> => {
    if (!depositForm.quantity || !depositForm.cost) {
      showErrorToast('Please enter quantity and cost');
      return;
    }

    try {
      if (!vaultName) return;
      await vaultApi.depositToVault(vaultName, {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process deposit';
      showErrorToast(message);
    }
  };

  const handleWithdraw = async (): Promise<void> => {
    if (!withdrawForm.quantity || !withdrawForm.value) {
      showErrorToast('Please enter quantity and value');
      return;
    }

    try {
      if (!vaultName) return;
      await vaultApi.withdrawFromVault(vaultName, {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process withdrawal';
      showErrorToast(message);
    }
  };

  const handleEndVault = async (): Promise<void> => {
    if (!confirm('Are you sure you want to end this vault? This will mark it as closed.')) {
      return;
    }

    try {
      if (!vaultName) return;
      await vaultApi.endVault(vaultName);
      showSuccessToast('Vault ended successfully!');
      await loadVault();
      await loadVaultTransactions();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to end vault';
      showErrorToast(message);
    }
  };

  const handleDeleteVault = async (): Promise<void> => {
    if (!confirm('Delete this vault permanently? This cannot be undone.')) {
      return;
    }
    try {
      if (!vaultName) return;
      await vaultApi.deleteVault(vaultName);
      showSuccessToast('Vault deleted successfully!');
      navigate('/vaults');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete vault';
      showErrorToast(message);
    }
  };

  const handleManualUpdate = async (): Promise<void> => {
    const input = window.prompt('Enter current value (USD) for manual update');
    if (input === null) return; // cancelled
    const value = parseFloat(input);
    if (isNaN(value) || value <= 0) {
      showErrorToast('Please enter a valid positive number');
      return;
    }
    try {
      if (!vaultName) return;
      const data = await vaultApi.refresh<ManualMetrics>(vaultName, { current_value_usd: value });
      if (data) {
        setManualMetrics(data);
        showSuccessToast('Manual update calculated');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to run manual update';
      showErrorToast(message);
    }
  };

  const formatVaultNumber = (value: string | number, decimals: number = 2): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const vaultColumns: TableColumn<Vault>[] = [
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
      render: (value, _column, row) => {
        const qty = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        const decimals = getDecimalPlaces(row.asset || 'USD');
        return formatVaultNumber(qty, decimals);
      },
    },
    {
      key: 'deposit_cost',
      title: 'Total Cost',
      type: 'currency',
      currency: 'USD',
      render: (value) => formatCurrency(typeof value === 'string' && value !== '' ? parseFloat(value) : 0, 'USD'),
    },
    {
      key: 'remaining_qty',
      title: 'Remaining Balance',
      type: 'number',
      decimals: 8,
      render: (value, _column, row) => {
        const qty = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        const decimals = getDecimalPlaces(row.asset || 'USD');
        return formatVaultNumber(qty, decimals);
      },
    },
    {
      key: 'pnl',
      title: 'Realized P&L',
      type: 'currency',
      currency: 'USD',
      render: (value) => {
        const pnl = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        const formattedPnL = formatPnL(pnl, 'USD') as { colorClass: string; sign: string; value: string };
        return <span className={formattedPnL.colorClass}>{formattedPnL.sign}{formattedPnL.value}</span>;
      },
    },
    {
      key: 'pnl_percent',
      title: 'ROI %',
      type: 'number',
      decimals: 2,
      render: (value) => {
        const roi = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        const isPositive = roi > 0;
        const className = isPositive ? 'text-green-700' : roi < 0 ? 'text-red-700' : 'text-gray-700';
        return <span className={className}>{formatPercentage(roi / 100, 2)}</span>;
      },
    },
    {
      key: 'vault_status',
      title: 'Status',
      render: (value) => {
        const status = (typeof value === 'string' ? value : String(value as string ?? '')).toLowerCase();
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

  const transactionColumns: TableColumn<Transaction>[] = [
    {
      key: 'date',
      title: 'Date',
      type: 'date',
    },
    {
      key: 'type',
      title: 'Type',
      render: (value: unknown) => {
        const type = String(value as string ?? '').toLowerCase();
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
    return (vault?.asset ?? '').toUpperCase() === 'USD';
  }, [vault]);

  useEffect(() => {
    // When opening deposit form for USD vault, default qty to 1
    if (isUsdOnlyVault && showDepositForm) {
      setDepositForm((s) => ({ ...s, quantity: s.quantity ?? '1' }));
    }
  }, [isUsdOnlyVault, showDepositForm]);

  const onChangeWithdrawPercent = (val: string) => {
    setWithdrawPercent(val);
    const pct = parseFloat(val ?? '');
    const rem = parseFloat(String(vault?.remaining_qty ?? '0'));
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
          <p className="text-gray-600 mb-4">{error ?? 'The requested vault could not be found.'}</p>
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
          {`${vault.asset} @ ${vault.account}${vault.horizon ? ` [${vault.horizon}]` : ''}`}
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
          <p className="text-2xl font-bold text-gray-900">
            {(() => {
              const isUSD = String(vault.asset ?? '').toUpperCase() === 'USD';
              const decimals = getDecimalPlaces(vault.asset ?? 'USD');
              const value = isUSD
                ? (typeof vault.deposit_cost === 'string' ? parseFloat(vault.deposit_cost) : (vault.deposit_cost as unknown as number))
                : (typeof vault.deposit_qty === 'string' ? parseFloat(vault.deposit_qty) : (vault.deposit_qty as unknown as number));
              return `${formatVaultNumber(value ?? 0, isUSD ? 2 : decimals)} ${vault.asset}`;
            })()}
          </p>
          <p className="text-sm text-gray-600">{formatCurrency(parseFloat(vault.deposit_cost ?? '0'))}</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Current Balance</h3>
          <p className="text-2xl font-bold text-gray-900">
            {(() => {
              const isUSD = String(vault.asset ?? '').toUpperCase() === 'USD';
              if (isUSD) {
                const deposit = typeof vault.deposit_cost === 'string' ? parseFloat(vault.deposit_cost) : (vault.deposit_cost as unknown as number);
                const withdrawn = typeof vault.withdrawal_value === 'string' ? parseFloat(vault.withdrawal_value) : (vault.withdrawal_value as unknown as number);
                const remainingUSD = (deposit ?? 0) - (withdrawn ?? 0);
                return `${formatVaultNumber(remainingUSD < 0 ? 0 : remainingUSD, 2)} USD`;
              }
              const decimals = getDecimalPlaces(vault.asset ?? 'USD');
              const qty = typeof vault.remaining_qty === 'string' ? parseFloat(vault.remaining_qty) : (vault.remaining_qty as unknown as number);
              return `${formatVaultNumber(qty ?? 0, decimals)} ${vault.asset}`;
            })()}
          </p>
          <p className="text-sm text-gray-600">Remaining in vault</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Realized P&L</h3>
          <p className={`text-2xl font-bold ${parseFloat(vault.pnl ?? '0') >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(parseFloat(vault.pnl ?? '0'))}
          </p>
          <p className="text-sm text-gray-600">{formatVaultNumber(vault.pnl_percent, 2)}% ROI</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Vault Status</h3>
          <p className="text-lg font-medium text-gray-900 capitalize">{vault.vault_status ?? 'Unknown'}</p>
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
          onClick={() => { void handleEndVault(); }}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            End Vault
          </button>
        )}
        <button
          onClick={() => { void handleDeleteVault(); }}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Delete Vault
        </button>
        <button
          onClick={() => { void handleManualUpdate(); }}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
        >
          Manual Update
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
              onClick={() => { void handleDeposit(); }}
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
              onClick={() => { void handleWithdraw(); }}
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
      {manualMetrics && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
          <h3 className="text-lg font-semibold mb-2">Manual Update</h3>
          <div className="text-sm text-gray-700 mb-2">
            As of: {manualMetrics.as_of ? new Date(manualMetrics.as_of).toLocaleString() : '—'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-gray-500 text-sm">Current Value</div>
              <div className="font-semibold">{formatCurrency(manualMetrics.current_value_usd ?? 0)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-sm">ROI (now)</div>
              <div className="font-semibold">{formatVaultNumber(manualMetrics.roi_realtime_percent ?? 0, 2)}%</div>
            </div>
            <div>
              <div className="text-gray-500 text-sm">APR (now)</div>
              <div className="font-semibold">{formatVaultNumber(manualMetrics.apr_percent ?? 0, 2)}%</div>
            </div>
          </div>
          {manualMetrics.benchmark_asset && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <div className="text-gray-500 text-sm">Benchmark</div>
                <div className="font-semibold">{manualMetrics.benchmark_asset}</div>
              </div>
              <div>
                <div className="text-gray-500 text-sm">Benchmark ROI</div>
                <div className="font-semibold">{formatVaultNumber(manualMetrics.benchmark_roi_percent ?? 0, 2)}%</div>
              </div>
              <div>
                <div className="text-gray-500 text-sm">Benchmark APR</div>
                <div className="font-semibold">{formatVaultNumber(manualMetrics.benchmark_apr_percent ?? 0, 2)}%</div>
              </div>
            </div>
          )}
        </div>
      )}
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