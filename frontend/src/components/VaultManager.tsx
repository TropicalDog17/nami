import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useToast } from './ui/Toast';
import { useBackendStatus } from '../context/BackendStatusContext';
import { vaultApi } from '../services/api';

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

const VaultManager: React.FC = () => {
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

  useEffect(() => {
    loadVaults();
  }, []);

  const loadVaults = async () => {
    try {
      setLoading(true);
      setError(null);
      const vaultsData = await vaultApi.getActiveVaults();
      setVaults(vaultsData as Vault[]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load vaults');
      showErrorToast('Failed to load vaults');
    } finally {
      setLoading(false);
    }
  };

  const handleVaultClick = (vault: Vault) => {
    // Navigate to vault detail page using vault name
    navigate(`/vault/${encodeURIComponent(vault.vault_name || vault.id)}`);
  };

  const formatCurrency = (value: string | number, currency: string = 'USD'): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(num);
  };

  const formatNumber = (value: string | number, decimals: number = 2): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-4">Error loading vaults</div>
        <button
          onClick={loadVaults}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (vaults.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500 mb-4">No vaults found</div>
        <p className="text-sm text-gray-600 mb-4">
          Create your first vault to start tracking your investments.
        </p>
        <button
          onClick={() => navigate('/transactions')}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Go to Transactions
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Vault Management
        </h1>
        <p className="text-gray-600">
          Click on any vault to view detailed information, P&L, and transaction history.
        </p>
      </div>

      {/* Vault Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vaults.map((vault) => {
          const pnl = parseFloat(vault.pnl || '0');
          const pnlPercent = parseFloat(vault.pnl_percent || '0');
          const isPositive = pnl >= 0;
          const isPositivePercent = pnlPercent >= 0;

          return (
            <div
              key={vault.id}
              onClick={() => handleVaultClick(vault)}
              className="bg-white rounded-lg border border-gray-200 p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:border-blue-300"
            >
              {/* Vault Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {vault.vault_name || `Vault ${vault.id}`}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {vault.asset} @ {vault.account}
                    {vault.horizon && ` [${vault.horizon}]`}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      vault.is_open
                        ? 'bg-green-100 text-green-800'
                        : vault.vault_status === 'ended'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {vault.vault_status === 'active' ? 'Active' : vault.vault_status === 'ended' ? 'Ended' : 'Unknown'}
                  </span>
                  <span className="text-xs text-gray-500 mt-1">
                    Created {formatDate(vault.created_at)}
                  </span>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="space-y-3">
                {/* Balance */}
                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-medium text-gray-500">Balance</span>
                    <span className="text-lg font-semibold text-gray-900">
                      {formatNumber(vault.remaining_qty, 8)} {vault.asset}
                    </span>
                  </div>
                </div>

                {/* Total Deposited */}
                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-medium text-gray-500">Total Deposited</span>
                    <span className="text-sm font-medium text-gray-700">
                      {formatCurrency(vault.deposit_cost)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatNumber(vault.deposit_qty, 8)} {vault.asset}
                  </div>
                </div>

                {/* P&L */}
                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-medium text-gray-500">Realized P&L</span>
                    <div className="text-right">
                      <span className={`text-lg font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(pnl)}
                      </span>
                      <span className={`text-sm font-medium ml-2 ${isPositivePercent ? 'text-green-600' : 'text-red-600'}`}>
                        ({isPositivePercent ? '+' : ''}{formatNumber(pnlPercent, 2)}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Time Information */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">First Deposit</span>
                    <span className="text-gray-700">{formatDate(vault.deposit_date)}</span>
                  </div>
                  {vault.vault_ended_at && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Ended</span>
                      <span className="text-gray-700">{formatDate(vault.vault_ended_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Instructions */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          Vault Management
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Click on any vault card to view detailed P&L, transaction history, and manage deposits/withdrawals</li>
          <li>• Active vaults allow deposits and withdrawals</li>
          <li>• End a vault when you're done to lock in final returns</li>
          <li>• All investment tracking is now vault-based for better organization</li>
        </ul>
      </div>
    </div>
  );
};

export default VaultManager;