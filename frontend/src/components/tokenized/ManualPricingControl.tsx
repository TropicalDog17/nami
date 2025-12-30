import React, { useState } from 'react';

import { tokenizedVaultApi } from '../../services/api';
import { useToast } from '../ui/Toast';

interface ManualPricingControlProps {
  vaultId: string;
  currentPrice: number;
  currentTotalValue: number;
  totalSupply: number;
  isManualPricing: boolean;
  onMetricsUpdate: (metrics: { price: number; totalValue: number }) => void;
  onPricingModeChange: (isManual: boolean) => void;
}

type VaultMetricsResponse = {
  current_share_price?: string;
  manual_price_per_share?: string;
  total_assets_under_management?: string;
};

const ManualPricingControl: React.FC<ManualPricingControlProps> = ({
  vaultId,
  currentPrice,
  currentTotalValue,
  totalSupply,
  isManualPricing,
  onMetricsUpdate,
  onPricingModeChange,
}) => {
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [newTotalValue, setNewTotalValue] = useState('');
  const [notes, setNotes] = useState('');
  const [netContribution, setNetContribution] = useState('');
  const [loading, setLoading] = useState(false);
  const safeTotalValue = Number.isFinite(currentTotalValue) ? currentTotalValue : 0;
  const safeTotalSupply = Number.isFinite(totalSupply) ? totalSupply : 0;

  const handleEnableManualPricing = async () => {
    setLoading(true);
    try {
      await tokenizedVaultApi.enableManualPricing(vaultId, {
        initial_price: currentPrice,
      });
      showSuccessToast('Manual pricing enabled successfully!');
      onPricingModeChange(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to enable manual pricing';
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisableManualPricing = async () => {
    if (!confirm('Are you sure you want to disable manual pricing? The price will be determined by market data.')) {
      return;
    }

    setLoading(true);
    try {
      await tokenizedVaultApi.disableManualPricing(vaultId);
      showSuccessToast('Manual pricing disabled successfully!');
      onPricingModeChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to disable manual pricing';
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTotalValue = async (e: React.FormEvent) => {
    e.preventDefault();

    const totalValue = parseFloat(newTotalValue);
    const netContributionDelta = netContribution ? parseFloat(netContribution) : 0;
    if (isNaN(totalValue) || totalValue <= 0) {
      showErrorToast('Please enter a valid total vault value greater than 0');
      return;
    }
    if (isNaN(netContributionDelta)) {
      showErrorToast('Please enter a valid net deposit/withdrawal amount');
      return;
    }

    setLoading(true);
    try {
      const response = await tokenizedVaultApi.updateTotalValue<VaultMetricsResponse>(vaultId, {
        total_value: totalValue,
        net_contribution_delta: netContributionDelta !== 0 ? netContributionDelta : undefined,
        notes: notes || undefined,
      });
      const updatedPrice =
        response !== null && response !== undefined
          ? parseFloat(response.current_share_price ?? response.manual_price_per_share ?? `${currentPrice}`)
          : Number.NaN;
      const updatedValue =
        response !== null && response !== undefined
          ? parseFloat(response.total_assets_under_management ?? `${totalValue}`)
          : Number.NaN;

      showSuccessToast('Total vault value updated successfully!');
      onMetricsUpdate({
        price: !isNaN(updatedPrice) ? updatedPrice : currentPrice,
        totalValue: !isNaN(updatedValue) ? updatedValue : totalValue,
      });
      setShowUpdateForm(false);
      setNewTotalValue('');
      setNetContribution('');
      setNotes('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update total vault value';
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Token Pricing</h3>
          <p className="text-xs text-gray-500">
            Current price: ${currentPrice.toFixed(4)} {isManualPricing && '(Manual)'}
          </p>
          <p className="text-xs text-gray-500">
            Total vault value: ${safeTotalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </div>

        {!isManualPricing ? (
          <button
            onClick={handleEnableManualPricing}
            disabled={loading}
            className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? 'Enabling...' : 'Enable Manual Pricing'}
          </button>
        ) : (
          <div className="flex space-x-2">
            <button
              onClick={() => setShowUpdateForm(!showUpdateForm)}
              disabled={loading}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Update Total Value
            </button>
            <button
              onClick={handleDisableManualPricing}
              disabled={loading}
              className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? 'Disabling...' : 'Switch to Auto'}
            </button>
          </div>
        )}
      </div>

      {showUpdateForm && (
        <form onSubmit={handleUpdateTotalValue} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              New Total Vault Value (USD)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newTotalValue}
              onChange={(e) => setNewTotalValue(e.target.value)}
              placeholder={safeTotalValue.toString()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              required
            />
            {safeTotalSupply > 0 ? (
              <p className="text-xs text-gray-500 mt-1">
                Based on {safeTotalSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens outstanding,
                this
                sets the price to $
                {newTotalValue
                  ? (parseFloat(newTotalValue) / safeTotalSupply).toFixed(4)
                  : (safeTotalValue / safeTotalSupply).toFixed(4)}
                .
              </p>
            ) : (
              <p className="text-xs text-yellow-700 mt-1">
                Token price will update once shares are minted. For now the vault value snapshot is stored.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Net Deposits / Withdrawals Since Last Update (USD)
            </label>
            <input
              type="number"
              step="0.01"
              value={netContribution}
              onChange={(e) => setNetContribution(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Positive numbers increase capital (deposits), negative numbers decrease capital (withdrawals). The share
              price is adjusted using net performance only.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why are you updating the vault value?"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div className="flex space-x-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Total Value'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowUpdateForm(false);
                setNewTotalValue('');
                setNetContribution('');
                setNotes('');
              }}
              disabled={loading}
              className="flex-1 bg-gray-200 text-gray-800 px-3 py-1.5 rounded-md text-sm hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isManualPricing && !showUpdateForm && (
        <div className="text-xs text-gray-600">
          <p className="font-medium text-purple-700">Manual Pricing Active</p>
          <p>Provide total value plus net deposits/withdrawals so price reflects pure performance; every update is logged.</p>
        </div>
      )}
    </div>
  );
};

export default ManualPricingControl;