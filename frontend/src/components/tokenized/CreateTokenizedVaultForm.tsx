import React, { useState } from 'react';

import { tokenizedVaultApi } from '../../services/api';
import { useToast } from '../ui/Toast';

type VaultType = 'user_defined';

interface FormData {
  name: string;
  description: string;
  type: VaultType;
  tokenSymbol: string;
  initialDeposit: string;
  initialPrice: string;
  enableManualPricing: boolean;
}

const CreateTokenizedVaultForm: React.FC<{
  onSuccess: () => void;
  onCancel: () => void;
}> = ({ onSuccess, onCancel }) => {
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    type: 'user_defined',
    tokenSymbol: '',
    initialDeposit: '',
    initialPrice: '',
    enableManualPricing: false,
  });

  const vaultTypes = [
    {
      value: 'user_defined',
      label: 'User-Defined Token (Manual Pricing)',
      description: 'Create a token where you manually set the value',
    },
  ];

  const generateTokenSymbol = (name: string): string => {
    return (
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10) || 'TOKEN'
    );
  };

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      tokenSymbol: prev.tokenSymbol || generateTokenSymbol(name),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.tokenSymbol || !formData.initialDeposit) {
      showErrorToast('Please fill in all required fields');
      return;
    }

    if (formData.enableManualPricing && !formData.initialPrice) {
      showErrorToast(
        'Initial price is required when manual pricing is enabled'
      );
      return;
    }

    setLoading(true);

    try {
      const vaultData = {
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        status: 'active',
        token_symbol: formData.tokenSymbol,
        token_decimals: 18,
        // Backend expects strings for decimal fields
        initial_share_price:
          formData.initialPrice && formData.initialPrice !== ''
            ? String(formData.initialPrice)
            : '1',
        min_deposit_amount: '0',
        is_deposit_allowed: true,
        is_withdrawal_allowed: true,
        created_by: 'web',
      };

      await tokenizedVaultApi.create(vaultData);
      showSuccessToast('Tokenized vault created successfully!');
      onSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create vault';
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  };

  const calculateShares = (): string => {
    const deposit = parseFloat(formData.initialDeposit) || 0;
    const price = parseFloat(formData.initialPrice) || 1;
    return (deposit / price).toFixed(6);
  };

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <h2 className="text-xl font-semibold mb-4">Create Tokenized Vault</h2>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {/* Vault Type Selection */}
        <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
          <div className="text-sm font-medium text-gray-700">Vault Type</div>
          <div className="mt-2">
            <div className="font-medium text-blue-900">
              {vaultTypes[0].label}
            </div>
            <div className="text-sm text-blue-700">
              {vaultTypes[0].description}
            </div>
          </div>
        </div>

        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vault Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., Short-Term Trading Strategy"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Token Symbol *
            </label>
            <input
              type="text"
              value={formData.tokenSymbol}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  tokenSymbol: e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, ''),
                }))
              }
              placeholder="e.g., TRADE1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={10}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Optional description of your vault strategy"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Initial Investment */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial Deposit (USD) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.initialDeposit}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  initialDeposit: e.target.value,
                }))
              }
              placeholder="1000.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {(formData.type === 'user_defined' ||
            formData.enableManualPricing) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Initial Price per Token (USD) *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.initialPrice}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    initialPrice: e.target.value,
                  }))
                }
                placeholder="1.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required={formData.enableManualPricing}
              />
            </div>
          )}
        </div>

        {/* Preview */}
        {formData.initialDeposit &&
          (formData.initialPrice || !formData.enableManualPricing) && (
            <div className="bg-blue-50 p-4 rounded-md">
              <h3 className="font-medium text-blue-900 mb-2">Preview</h3>
              <div className="text-sm text-blue-800 space-y-1">
                <div>
                  Vault: {formData.name} ({formData.tokenSymbol})
                </div>
                <div>
                  Initial Deposit: $
                  {parseFloat(formData.initialDeposit).toLocaleString()}
                </div>
                <div>
                  Initial Price: $
                  {formData.enableManualPricing
                    ? parseFloat(formData.initialPrice || '1').toFixed(2)
                    : 'Market Price'}
                </div>
                <div>
                  {formData.tokenSymbol} Tokens Created: {calculateShares()}
                </div>
                <div>
                  Later, you can update 1 {formData.tokenSymbol} = any value you
                  want
                </div>
              </div>
            </div>
          )}

        {/* Actions */}
        <div className="flex space-x-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Vault'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateTokenizedVaultForm;
