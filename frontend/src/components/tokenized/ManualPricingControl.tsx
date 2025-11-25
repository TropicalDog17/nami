import React, { useState } from 'react';
import { useToast } from '../ui/Toast';
import { tokenizedVaultApi } from '../../services/api';

interface ManualPricingControlProps {
  vaultId: string;
  currentPrice: number;
  isManualPricing: boolean;
  onPriceUpdate: (newPrice: number) => void;
  onPricingModeChange: (isManual: boolean) => void;
}

const ManualPricingControl: React.FC<ManualPricingControlProps> = ({
  vaultId,
  currentPrice,
  isManualPricing,
  onPriceUpdate,
  onPricingModeChange,
}) => {
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleUpdatePrice = async (e: React.FormEvent) => {
    e.preventDefault();

    const price = parseFloat(newPrice);
    if (isNaN(price) || price <= 0) {
      showErrorToast('Please enter a valid price');
      return;
    }

    setLoading(true);
    try {
      await tokenizedVaultApi.updatePrice(vaultId, {
        new_price: price,
        notes: notes || undefined,
      });
      showSuccessToast('Price updated successfully!');
      onPriceUpdate(price);
      setShowUpdateForm(false);
      setNewPrice('');
      setNotes('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update price';
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
            Current: ${currentPrice.toFixed(4)} {isManualPricing && '(Manual)'}
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
              Update Price
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
        <form onSubmit={handleUpdatePrice} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              New Price per Token (USD)
            </label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder={currentPrice.toString()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why are you updating the price?"
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
              {loading ? 'Updating...' : 'Update Price'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowUpdateForm(false);
                setNewPrice('');
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
          <p>You control the token value. Updates are recorded in the vault history.</p>
        </div>
      )}
    </div>
  );
};

export default ManualPricingControl;