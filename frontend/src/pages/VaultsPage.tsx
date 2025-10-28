import { format } from 'date-fns';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import ComboBox from '../components/ui/ComboBox';
import DataTable from '../components/ui/DataTable';
import DateInput from '../components/ui/DateInput';
import { useToast } from '../components/ui/Toast';
import { useBackendStatus } from '../context/BackendStatusContext';
import { vaultApi, actionsApi, adminApi } from '../services/api';
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
  apr_percent?: string;
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

const VaultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isOnline } = useBackendStatus() as unknown as { isOnline: boolean };
  const { error: showErrorToast, success: showSuccessToast } =
    useToast() as unknown as {
      error: (m: string) => void;
      success: (m: string) => void;
    };

  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [assets, setAssets] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [horizons, setHorizons] = useState<Option[]>([
    { value: 'short-term', label: 'Short-term' },
    { value: 'long-term', label: 'Long-term' },
    { value: 'speculative', label: 'Speculative' },
  ]);

  // Form states for vault creation
  const [createForm, setCreateForm] = useState({
    asset: '',
    account: '',
    horizon: '',
    depositQty: '',
    depositCost: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    loadVaults();
    loadAssets();
    loadAccounts();
  }, [filter]);

  const loadVaults = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = {};
      if (filter === 'open') params.is_open = true;
      if (filter === 'closed') params.is_open = false;

      const vaultsData = await vaultApi.getActiveVaults() as Vault[];
      setVaults(vaultsData || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load vaults');
      showErrorToast('Failed to load vaults');
    } finally {
      setLoading(false);
    }
  };

  const loadAssets = async () => {
    try {
      const assetsData = await adminApi.listAssets() as any[];
      const options = assetsData.map((asset: any) => ({
        value: asset.symbol,
        label: `${asset.symbol} - ${asset.name || asset.symbol}`,
      }));
      setAssets(options);
    } catch (err) {
      console.error('Failed to load assets:', err);
      // Fallback to common assets
      setAssets([
        { value: 'BTC', label: 'BTC - Bitcoin' },
        { value: 'ETH', label: 'ETH - Ethereum' },
        { value: 'USDT', label: 'USDT - Tether' },
        { value: 'USDC', label: 'USDC - USD Coin' },
      ]);
    }
  };

  const loadAccounts = async () => {
    try {
      const accountsData = await adminApi.listAccounts() as any[];
      const options = accountsData.map((account: any) => ({
        value: account.name,
        label: `${account.name} (${account.type})`,
      }));
      setAccounts(options);
    } catch (err) {
      console.error('Failed to load accounts:', err);
      // Fallback to common accounts
      setAccounts([
        { value: 'Binance', label: 'Binance (exchange)' },
        { value: 'Coinbase', label: 'Coinbase (exchange)' },
        { value: 'Cash - USD', label: 'Cash - USD (bank)' },
        { value: 'Cash - VND', label: 'Cash - VND (bank)' },
      ]);
    }
  };

  const handleCreateVault = async () => {
    if (!createForm.asset || !createForm.account || !createForm.depositQty || !createForm.depositCost) {
      showErrorToast('Please fill in all required fields');
      return;
    }

    try {
      // Create vault via vault API
      const vaultData = {
        asset: createForm.asset,
        account: createForm.account,
        horizon: createForm.horizon || null,
        depositQty: parseFloat(createForm.depositQty),
        depositCost: parseFloat(createForm.depositCost),
        date: createForm.date,
      };

      await vaultApi.createVault(vaultData);

      showSuccessToast('Vault created successfully!');
      setShowCreateForm(false);
      setCreateForm({
        asset: '',
        account: '',
        horizon: '',
        depositQty: '',
        depositCost: '',
        date: format(new Date(), 'yyyy-MM-dd'),
      });

      await loadVaults();
    } catch (err: any) {
      showErrorToast(err?.message || 'Failed to create vault');
    }
  };

  const handleEndVault = async (vault: any) => {
    const vaultName = `${vault.asset} - ${vault.account}`;
    if (!confirm(`Are you sure you want to end vault "${vaultName}"? This will mark it as closed but keep all data.`)) {
      return;
    }

    try {
      await vaultApi.endVault(vault.id);
      showSuccessToast('Vault ended successfully!');
      await loadVaults();
    } catch (err: any) {
      showErrorToast(err?.message || 'Failed to end vault');
    }
  };

  const handleDeleteVault = async (vault: any) => {
    const vaultName = `${vault.asset} - ${vault.account}`;
    if (!confirm(`Are you sure you want to delete vault "${vaultName}"? This action cannot be undone and will permanently remove all vault data.`)) {
      return;
    }

    try {
      await vaultApi.deleteVault(vault.id);
      showSuccessToast('Vault deleted successfully!');
      await loadVaults();
    } catch (err: any) {
      showErrorToast(err?.message || 'Failed to delete vault');
    }
  };

  const handleViewVault = (vault: any) => {
    navigate(`/vault/${vault.id}`);
  };

  const formatVaultNumber = (value: string | number, decimals: number = 2): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const vaultColumns: Column[] = [
    {
      key: 'vault_name',
      title: 'Vault Name',
      render: (value: any, column: any, row: any) => {
        const vaultName = `${row.asset} - ${row.account}`;
        return (
          <button
            onClick={() => navigate(`/vault/${row.id}`)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {vaultName}
          </button>
        );
      },
    },
    {
      key: 'asset',
      title: 'Asset',
      render: (value: any) => (
        <span className="font-medium">{value}</span>
      ),
    },
    {
      key: 'account',
      title: 'Account',
    },
    {
      key: 'horizon',
      title: 'Horizon',
      render: (value: any) => {
        if (!value) return <span className="text-gray-500">-</span>;
        const horizonConfig = {
          'short-term': { label: 'Short-term', class: 'bg-blue-100 text-blue-800' },
          'long-term': { label: 'Long-term', class: 'bg-green-100 text-green-800' },
          'speculative': { label: 'Speculative', class: 'bg-purple-100 text-purple-800' },
        };
        const config = horizonConfig[value as keyof typeof horizonConfig] || { label: value, class: 'bg-gray-100 text-gray-800' };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.class}`}>
            {config.label}
          </span>
        );
      },
    },
    {
      key: 'deposit_date',
      title: 'Created',
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
      title: 'Current Balance',
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
      title: 'P&L',
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
      key: 'apr_percent',
      title: 'APR %',
      type: 'number',
      decimals: 2,
      render: (value: any) => {
        if (!value) return <span className="text-gray-500">-</span>;
        const apr = parseFloat(value || '0');
        const isPositive = apr > 0;
        const className = isPositive ? 'text-green-700' : apr < 0 ? 'text-red-700' : 'text-gray-700';
        return <span className={className}>{formatPercentage(apr / 100, 2)}</span>;
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
    {
      key: 'actions',
      title: 'Actions',
      render: (value: any, column: any, row: any) => (
        <div className="flex space-x-2">
          {row.is_open && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEndVault(row);
              }}
              className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
              title="End Vault"
            >
              End
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteVault(row);
            }}
            className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
            title="Delete Vault"
          >
            Delete
          </button>
        </div>
      ),
    },
      ];

  const filteredVaults = useMemo(() => {
    if (filter === 'all') return vaults;
    return vaults.filter(vault =>
      filter === 'open' ? vault.is_open : !vault.is_open
    );
  }, [vaults, filter]);

  const totalStats = useMemo(() => {
    const stats = {
      totalVaults: filteredVaults.length,
      activeVaults: filteredVaults.filter(v => v.is_open).length,
      totalDeposited: 0,
      totalValue: 0,
      totalPnL: 0,
    };

    filteredVaults.forEach(vault => {
      stats.totalDeposited += parseFloat(vault.deposit_cost || '0');
      stats.totalValue += parseFloat(vault.remaining_qty || '0') * parseFloat(vault.deposit_unit_cost || '0');
      stats.totalPnL += parseFloat(vault.pnl || '0');
    });

    return stats;
  }, [filteredVaults]);

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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Investment Vaults</h1>
        <p className="text-gray-600">Manage your investment vaults and track performance</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Vaults</h3>
          <p className="text-2xl font-bold text-gray-900">{totalStats.totalVaults}</p>
          <p className="text-sm text-gray-600">{totalStats.activeVaults} active</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Deposited</h3>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalStats.totalDeposited)}</p>
          <p className="text-sm text-gray-600">All time</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Current Value</h3>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalStats.totalValue)}</p>
          <p className="text-sm text-gray-600">Active vaults</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total P&L</h3>
          <p className={`text-2xl font-bold ${totalStats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(totalStats.totalPnL)}
          </p>
          <p className="text-sm text-gray-600">Realized gains</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Return</h3>
          <p className={`text-2xl font-bold ${totalStats.totalDeposited > 0 ? (totalStats.totalPnL / totalStats.totalDeposited * 100) >= 0 ? 'text-green-600' : 'text-red-600' : 'text-gray-600'}`}>
            {totalStats.totalDeposited > 0 ? formatPercentage(totalStats.totalPnL / totalStats.totalDeposited, 2) : '0%'}
          </p>
          <p className="text-sm text-gray-600">Overall ROI</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-3 sm:space-y-0">
        <div className="flex space-x-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            All ({vaults.length})
          </button>
          <button
            onClick={() => setFilter('open')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              filter === 'open'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Active ({vaults.filter(v => v.is_open).length})
          </button>
          <button
            onClick={() => setFilter('closed')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              filter === 'closed'
                ? 'bg-gray-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Closed ({vaults.filter(v => !v.is_open).length})
          </button>
        </div>

        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
        >
          <span className="mr-2">+</span> Create New Vault
        </button>
      </div>

      {/* Create Vault Form */}
      {showCreateForm && (
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <h3 className="text-lg font-semibold mb-4">Create New Vault</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <ComboBox
              options={assets}
              value={createForm.asset}
              onChange={(value) => setCreateForm({ ...createForm, asset: value })}
              placeholder="Asset"
            />
            <ComboBox
              options={accounts}
              value={createForm.account}
              onChange={(value) => setCreateForm({ ...createForm, account: value })}
              placeholder="Account"
            />
            <ComboBox
              options={horizons}
              value={createForm.horizon}
              onChange={(value) => setCreateForm({ ...createForm, horizon: value })}
              placeholder="Horizon (optional)"
            />
            <input
              type="number"
              step="any"
              placeholder="Deposit Quantity"
              value={createForm.depositQty}
              onChange={(e) => setCreateForm({ ...createForm, depositQty: e.target.value })}
              className="px-3 py-2 border rounded-md"
            />
            <input
              type="number"
              step="any"
              placeholder="Deposit Cost (USD)"
              value={createForm.depositCost}
              onChange={(e) => setCreateForm({ ...createForm, depositCost: e.target.value })}
              className="px-3 py-2 border rounded-md"
            />
            <DateInput
              value={createForm.date}
              onChange={(value) => setCreateForm({ ...createForm, date: value })}
              placeholder="Date"
            />
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleCreateVault}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create Vault
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Vaults Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <DataTable
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
      </div>
    </div>
  );
};

export default VaultsPage;