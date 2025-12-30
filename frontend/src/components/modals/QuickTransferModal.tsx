import React, { useState } from 'react';

import { useApp } from '../../context/AppContext';
import { getTodayDate } from '../../utils/dateUtils';

interface QuickTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: unknown) => Promise<void>;
}

const QuickTransferModal: React.FC<QuickTransferModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const { accounts, assets } = useApp();
  const today = getTodayDate();

  const [formData, setFormData] = useState({
    date: today,
    quantity: '',
    from_account: '',
    to_account: '',
    asset: 'USD',
    fee: '0',
    note: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Transfer action expects:
      // from_account, to_account, asset, quantity, fee? (optional), date, note
      const payload = {
        action: 'transfer',
        params: {
            from_account: formData.from_account,
            to_account: formData.to_account,
            asset: formData.asset,
            quantity: parseFloat(formData.quantity),
            fee: parseFloat(formData.fee || '0'),
            date: formData.date, // YYYY-MM-DD is fine for action, backend handles it? 
            // verifying backend action date handling: it unwraps body.
            // actually backend actions.ts uses new Date(params.date || ...)
            // so YYYY-MM-DD is OK.
            note: formData.note
        }
      };
      
      // We pass the payload to onSubmit. 
      // Note: The parent handleQuickTransferSubmit usually calls the API.
      // But here we constructed the full payload.
      // Parent expects just the params probably? 
      // QuickExpenseModal constructs a fake transactionData to call createExpense.
      // Here we want to call actionsApi.perform('transfer', params).
      // So we should just pass params.
      
      await onSubmit(payload.params);
      onClose();
      // Reset form
      setFormData({
        date: today,
        quantity: '',
        from_account: '',
        to_account: '',
        asset: 'USD',
        fee: '0',
        note: ''
      });
    } catch (error) {
      console.error('Error submitting transfer:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Transfer Funds</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.quantity}
                    onChange={(e) => handleInputChange('quantity', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset</label>
                  <select
                    value={formData.asset}
                    onChange={(e) => handleInputChange('asset', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {(assets ?? []).filter((as: unknown) => {
                      const typedAs = as as { is_active: boolean };
                      return typedAs.is_active;
                    }).map((as: unknown) => {
                      const typedAs = as as { symbol: string; name?: string };
                      return <option key={typedAs.symbol} value={typedAs.symbol}>{typedAs.symbol}</option>;
                    })}
                  </select>
                </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Account</label>
              <select
                value={formData.from_account}
                onChange={(e) => handleInputChange('from_account', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select source</option>
                {(accounts ?? []).filter((a: unknown) => {
                   const typedA = a as { is_active: boolean };
                   return typedA.is_active;
                }).map((a: unknown) => {
                   const typedA = a as { name: string; type: string };
                   return <option key={typedA.name} value={typedA.name}>{typedA.name} ({typedA.type})</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Account</label>
              <select
                value={formData.to_account}
                onChange={(e) => handleInputChange('to_account', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select destination</option>
                {(accounts ?? []).filter((a: unknown) => {
                   const typedA = a as { is_active: boolean; name: string };
                   return typedA.is_active && typedA.name !== formData.from_account;
                }).map((a: unknown) => {
                   const typedA = a as { name: string; type: string };
                   return <option key={typedA.name} value={typedA.name}>{typedA.name} ({typedA.type})</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fee (optional)</label>
              <input
                type="number"
                step="any"
                value={formData.fee}
                onChange={(e) => handleInputChange('fee', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
              <input
                type="text"
                value={formData.note}
                onChange={(e) => handleInputChange('note', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Description"
              />
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.quantity || !formData.from_account || !formData.to_account}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Transferring...' : 'Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickTransferModal;
