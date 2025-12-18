import { format } from 'date-fns';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import DataTable, { TableColumn } from '../components/ui/DataTable';
import { useToast } from '../components/ui/Toast';
import { tokenizedVaultApi, ApiError } from '../services/api';
import { formatCurrency, formatPercentage } from '../utils/currencyFormatter';
import CreateTokenizedVaultForm from '../components/tokenized/CreateTokenizedVaultForm';
import { useBackendStatus } from '../context/BackendStatusContext';

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
  created_by: string;
  created_at: string;
  updated_at: string;
};

type Option = { value: string; label: string };

const VaultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isOnline } = useBackendStatus();
  const { error: showErrorToast, success: showSuccessToast } = useToast();
  const shouldToast = (e: unknown) => !(e instanceof ApiError && e.status === 0);

  const [vaults, setVaults] = useState<TokenizedVault[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('all');

  const loadVaults = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      // Fetch tokenized vaults
      const vaultsData = await tokenizedVaultApi.list<TokenizedVault[]>();
      setVaults(vaultsData ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load vaults';
      setError(message);
      if (shouldToast(err)) showErrorToast('Failed to load vaults');
    } finally {
      setLoading(false);
    }
  }, [showErrorToast]);

  useEffect(() => {
    void loadVaults();
  }, [filter, loadVaults]);

  const handleCreateVault = () => {
    setShowCreateForm(true);
  };

  const handleCloseVault = async (vault: TokenizedVault): Promise<void> => {
    if (!confirm(`Are you sure you want to close vault "${vault.name}"? This will mark it as closed but keep all data.`)) {
      return;
    }

    try {
      await tokenizedVaultApi.close(vault.id);
      showSuccessToast('Vault closed successfully!');
      void loadVaults();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to close vault';
      showErrorToast(message);
    }
  };

  const handleDeleteVault = async (vault: TokenizedVault): Promise<void> => {
    if (!confirm(`Are you sure you want to delete vault "${vault.name}"? This action cannot be undone and will permanently remove all vault data.`)) {
      return;
    }

    try {
      await tokenizedVaultApi.delete(vault.id);
      showSuccessToast('Vault deleted successfully!');
      void loadVaults();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete vault';
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
          <button
            onClick={() => handleViewVault(row)}
            className="text-blue-600 hover:text-blue-800 font-medium text-left"
          >
            {value}
          </button>
          <div className="text-sm text-gray-500">{row.token_symbol}</div>
          {row.description && (
            <div className="text-xs text-gray-400 truncate max-w-xs" title={row.description}>
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
        const isBorrowings = String(row.name || '').toLowerCase() === 'borrowings';
        if (isBorrowings) {
          return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800`}>
              Liability
            </span>
          );
        }
        const typeConfig = {
          user_defined: { label: 'User-Defined', class: 'bg-purple-100 text-purple-800' },
          single_asset: { label: 'Single Asset', class: 'bg-blue-100 text-blue-800' },
          multi_asset: { label: 'Multi-Asset', class: 'bg-green-100 text-green-800' },
        };
        const key = typeof value === 'string' ? value : '';
        const config = typeConfig[key as keyof typeof typeConfig] || { label: key, class: 'bg-gray-100 text-gray-800' };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.class}`}>
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
        const isBorrowings = String(row.name || '').toLowerCase() === 'borrowings';
        if (isBorrowings) {
          return <span className="text-gray-500">—</span>;
        }
        const price = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        const isManual = row.is_user_defined_price;
        return (
          <div>
            <div className="font-medium">${price.toFixed(4)}</div>
            {isManual && (
              <div className="text-xs text-orange-600">Manual</div>
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
        const num = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        const isBorrowings = String(row.name || '').toLowerCase() === 'borrowings';
        const cls = isBorrowings && num < 0 ? 'text-red-700 font-medium' : '';
        return <span className={cls}>{formatCurrency(num)}</span>;
      },
    },
    {
      key: 'total_supply',
      title: 'Total Supply',
      type: 'number',
      decimals: 6,
      render: (value, _c, row) => {
        const isBorrowings = String(row.name || '').toLowerCase() === 'borrowings';
        if (isBorrowings) return <span className="text-gray-500">—</span>;
        const supply = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        return supply.toLocaleString(undefined, { maximumFractionDigits: 6 });
      },
    },
    {
      key: 'performance_since_inception',
      title: 'Performance',
      type: 'number',
      decimals: 2,
      render: (value, _c, row) => {
        const isBorrowings = String(row.name || '').toLowerCase() === 'borrowings';
        if (isBorrowings) return <span className="text-gray-500">—</span>;
        const perf = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        const isPositive = perf > 0;
        const className = isPositive ? 'text-green-700' : perf < 0 ? 'text-red-700' : 'text-gray-700';
        return <span className={className}>{formatPercentage(perf / 100, 2)}</span>;
      },
    },
    {
      key: 'status',
      title: 'Status',
      render: (value) => {
        const status = (typeof value === 'string' ? value : '').toLowerCase();
        const statusConfig = {
          active: { label: 'Active', class: 'bg-green-100 text-green-800' },
          paused: { label: 'Paused', class: 'bg-yellow-100 text-yellow-800' },
          closed: { label: 'Closed', class: 'bg-gray-100 text-gray-800' },
          liquidating: { label: 'Liquidating', class: 'bg-red-100 text-red-800' },
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleCloseVault(row);
              }}
              className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
              title="Close Vault"
            >
              Close
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              void handleDeleteVault(row);
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
      filter === 'active' ? vault.status === 'active' : vault.status !== 'active'
    );
  }, [vaults, filter]);

  const totalStats = useMemo(() => {
    const stats = {
      totalVaults: filteredVaults.length,
      activeVaults: filteredVaults.filter(v => v.status === 'active').length,
      totalAUM: 0,
      totalSupply: 0,
      totalPerformance: 0,
    };

    filteredVaults.forEach(vault => {
      const aum = parseFloat(vault.total_assets_under_management || '0');
      const supply = parseFloat(vault.total_supply || '0');
      const performance = parseFloat(vault.performance_since_inception || '0');
      stats.totalAUM += aum;
      stats.totalSupply += supply;
      stats.totalPerformance += performance * aum / 100; // Weighted performance
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Tokenized Vaults</h1>
        <p className="text-gray-600">Create custom tokens and track your investment vaults</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Vaults</h3>
          <p className="text-2xl font-bold text-gray-900">{totalStats.totalVaults}</p>
          <p className="text-sm text-gray-600">{totalStats.activeVaults} active</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total AUM</h3>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalStats.totalAUM)}</p>
          <p className="text-sm text-gray-600">Assets under management</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Supply</h3>
          <p className="text-2xl font-bold text-gray-900">{totalStats.totalSupply.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="text-sm text-gray-600">Total tokens issued</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Avg Performance</h3>
          <p className={`text-2xl font-bold ${totalStats.totalAUM > 0 ? (totalStats.totalPerformance / totalStats.totalAUM * 100) >= 0 ? 'text-green-600' : 'text-red-600' : 'text-gray-600'}`}>
            {totalStats.totalAUM > 0 ? formatPercentage(totalStats.totalPerformance / totalStats.totalAUM, 2) : '0%'}
          </p>
          <p className="text-sm text-gray-600">Since inception</p>
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
            onClick={() => setFilter('active')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              filter === 'active'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Active ({vaults.filter(v => v.status === 'active').length})
          </button>
          <button
            onClick={() => setFilter('closed')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              filter === 'closed'
                ? 'bg-gray-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Closed ({vaults.filter(v => v.status !== 'active').length})
          </button>
        </div>

        <button
          onClick={handleCreateVault}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
        >
          <span className="mr-2">+</span> Create Tokenized Vault
        </button>
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
      <div className="bg-white rounded-lg border border-gray-200">
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
      </div>
    </div>
  );
};

export default VaultsPage;