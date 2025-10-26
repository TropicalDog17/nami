import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { vaultApi, Vault, CreateVaultRequest, VaultDepositRequest, VaultWithdrawalRequest } from '../services/vaultApi';

interface FastInvestmentButtonProps {
  onVaultUpdated?: () => void;
}

const FastInvestmentButton: React.FC<FastInvestmentButtonProps> = ({ onVaultUpdated }) => {
  const navigate = useNavigate();
  const { accounts, assets } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'manage' | 'deposit' | 'withdraw'>('create');
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create vault form
  const [vaultName, setVaultName] = useState('');
  const [selectedAsset, setSelectedAsset] = useState('');
  const [initialDeposit, setInitialDeposit] = useState('');
  const [sourceAccount, setSourceAccount] = useState('');

  // Transaction form
  const [amount, setAmount] = useState('');
  const [targetAccount, setTargetAccount] = useState('');

  // Auto-suggest source account
  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const spotAccount = accounts.find(acc =>
        acc.name.toLowerCase().includes('spot') || acc.name.toLowerCase().includes('main')
      );
      setSourceAccount(spotAccount?.name || accounts[0].name);
    }
  }, [accounts]);

  // Auto-suggest asset
  useEffect(() => {
    if (assets && assets.length > 0) {
      const usdt = assets.find(asset => asset.symbol === 'USDT');
      setSelectedAsset(usdt?.symbol || assets[0].symbol);
    }
  }, [assets]);

  // Load vaults when opening manage mode
  useEffect(() => {
    if (mode === 'manage' && isOpen) {
      loadVaults();
    }
  }, [mode, isOpen]);

  const loadVaults = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const activeVaults = await vaultApiService.getActiveVaults();
      setVaults(activeVaults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vaults');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!vaultName.trim() || !selectedAsset || !sourceAccount) {
      setError('Please fill in all required fields');
      return;
    }

    const deposit = parseFloat(initialDeposit) || 0;
    if (deposit < 0) {
      setError('Initial deposit cannot be negative');
      return;
    }

    setIsLoading(true);
    try {
      const request: CreateVaultRequest = {
        name: vaultName.trim(),
        asset: selectedAsset,
        account: sourceAccount,
        initialDeposit: deposit,
      };

      await vaultApiService.createVault(request);

      // Reset form
      setVaultName('');
      setInitialDeposit('');

      // Switch to manage mode
      setMode('manage');
      await loadVaults();

      if (onVaultUpdated) {
        onVaultUpdated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vault');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedVault || !amount || !sourceAccount) {
      setError('Please fill in all required fields');
      return;
    }

    const quantity = parseFloat(amount);
    if (quantity <= 0) {
      setError('Amount must be positive');
      return;
    }

    setIsLoading(true);
    try {
      const request: VaultDepositRequest = {
        quantity,
        cost: quantity, // Assuming 1:1 for simplicity
        sourceAccount,
      };

      await vaultApiService.depositToVault(selectedVault.vaultName || '', request);

      // Reset form
      setAmount('');

      // Reload vaults
      await loadVaults();

      if (onVaultUpdated) {
        onVaultUpdated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deposit to vault');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedVault || !amount || !targetAccount) {
      setError('Please fill in all required fields');
      return;
    }

    const quantity = parseFloat(amount);
    if (quantity <= 0) {
      setError('Amount must be positive');
      return;
    }

    setIsLoading(true);
    try {
      const request: VaultWithdrawalRequest = {
        quantity,
        value: quantity, // Assuming 1:1 for simplicity
        targetAccount,
      };

      await vaultApiService.withdrawFromVault(selectedVault.vaultName || '', request);

      // Reset form
      setAmount('');
      setTargetAccount('');

      // Reload vaults
      await loadVaults();

      if (onVaultUpdated) {
        onVaultUpdated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to withdraw from vault');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndVault = async (vaultName: string) => {
    setError(null);
    setIsLoading(true);
    try {
      await vaultApiService.endVault(vaultName);
      await loadVaults();

      if (onVaultUpdated) {
        onVaultUpdated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end vault');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteVault = async (vaultName: string) => {
    if (!confirm(`Are you sure you want to delete vault "${vaultName}"? This action cannot be undone.`)) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await vaultApiService.deleteVault(vaultName);
      await loadVaults();

      if (onVaultUpdated) {
        onVaultUpdated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete vault');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVaultDetails = (vaultName: string) => {
    // Navigate to vault detail page
    navigate(`/vault/${encodeURIComponent(vaultName)}`);
    setIsOpen(false); // Close modal
  };

  const formatBalance = (balanceStr: string) => {
    const balance = parseFloat(balanceStr) || 0;
    return balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all duration-200 hover:scale-110 z-50"
        title="Vault Manager"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              {mode === 'create' && 'Create New Vault'}
              {mode === 'manage' && 'Manage Vaults'}
              {mode === 'deposit' && 'Deposit to Vault'}
              {mode === 'withdraw' && 'Withdraw from Vault'}
            </h2>
            <button
              onClick={() => {
                setIsOpen(false);
                setError(null);
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="flex space-x-2 mt-4">
            <button
              onClick={() => setMode('create')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'create'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Create
            </button>
            <button
              onClick={() => setMode('manage')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'manage'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Manage
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {/* Create Vault Form */}
          {mode === 'create' && (
            <form onSubmit={handleCreateVault} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vault Name *
                </label>
                <input
                  type="text"
                  value={vaultName}
                  onChange={(e) => setVaultName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Emergency Fund, Savings Goal"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Asset *
                </label>
                <select
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  {assets?.map((asset) => (
                    <option key={asset.symbol} value={asset.symbol}>
                      {asset.symbol} - {asset.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source Account *
                </label>
                <select
                  value={sourceAccount}
                  onChange={(e) => setSourceAccount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  {accounts?.map((account) => (
                    <option key={account.name} value={account.name}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Deposit
                </label>
                <input
                  type="number"
                  step="any"
                  value={initialDeposit}
                  onChange={(e) => setInitialDeposit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                  min="0"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {isLoading ? 'Creating...' : 'Create Vault'}
              </button>
            </form>
          )}

          {/* Manage Vaults */}
          {mode === 'manage' && (
            <div className="space-y-4">
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-gray-600">Loading vaults...</p>
                </div>
              ) : vaults.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-2 text-gray-600">No vaults found</p>
                  <button
                    onClick={() => setMode('create')}
                    className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    Create your first vault
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {vaults.map((vault) => (
                    <div key={vault.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">
                            {vault.vaultName || `${vault.asset} Vault`}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {vault.asset} • {vault.account}
                          </p>
                          <div className="mt-2 space-y-1">
                            <p className="text-sm">
                              <span className="text-gray-500">Balance:</span>{' '}
                              <span className="font-medium">
                                {formatBalance(vault.remainingQty)} {vault.asset}
                              </span>
                            </p>
                            <p className="text-sm">
                              <span className="text-gray-500">Status:</span>{' '}
                              <span className={`font-medium ${
                                vault.vaultStatus === 'active' ? 'text-green-600' : 'text-gray-500'
                              }`}>
                                {vault.vaultStatus || 'active'}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {/* View Details Button */}
                          <button
                            onClick={() => handleVaultDetails(vault.vaultName || vault.id)}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 00-3 3m0 0a3 3 0 003 3m3-3v3m0-6h6m-6 0H6" />
                            </svg>
                          </button>
                          {vault.vaultStatus === 'active' && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedVault(vault);
                                  setMode('deposit');
                                }}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Deposit"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedVault(vault);
                                  setMode('withdraw');
                                }}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Withdraw"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                </svg>
                              </button>
                            </>
                          )}
                          {vault.vaultStatus === 'active' && (
                            <button
                              onClick={() => handleEndVault(vault.vaultName || '')}
                              disabled={isLoading}
                              className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                              title="End Vault"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          )}
                          {vault.vaultStatus === 'ended' && (
                            <button
                              onClick={() => handleDeleteVault(vault.vaultName || '')}
                              disabled={isLoading}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Vault"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Deposit Form */}
          {mode === 'deposit' && selectedVault && (
            <form onSubmit={handleDeposit} className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900">{selectedVault.vaultName || `${selectedVault.asset} Vault`}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Current balance: {formatBalance(selectedVault.remainingQty)} {selectedVault.asset}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                  min="0.00000001"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source Account *
                </label>
                <select
                  value={sourceAccount}
                  onChange={(e) => setSourceAccount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  {accounts?.map((account) => (
                    <option key={account.name} value={account.name}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  {isLoading ? 'Depositing...' : 'Deposit'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('manage')}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Withdraw Form */}
          {mode === 'withdraw' && selectedVault && (
            <form onSubmit={handleWithdraw} className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900">{selectedVault.vaultName || `${selectedVault.asset} Vault`}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Available balance: {formatBalance(selectedVault.remainingQty)} {selectedVault.asset}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                  min="0.00000001"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Account *
                </label>
                <select
                  value={targetAccount}
                  onChange={(e) => setTargetAccount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select target account</option>
                  {accounts?.map((account) => (
                    <option key={account.name} value={account.name}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  {isLoading ? 'Withdrawing...' : 'Withdraw'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('manage')}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default FastInvestmentButton;