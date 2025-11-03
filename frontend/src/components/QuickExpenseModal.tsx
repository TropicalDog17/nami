import React, { useState } from 'react';

import { useApp } from '../context/AppContext';

interface QuickExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (transactionData: unknown) => Promise<void>;
}

const QuickExpenseModal: React.FC<QuickExpenseModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const { accounts, assets, tags } = useApp();
  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    date: today,
    amount: '',
    category: '',
    note: '',
    account: '',
    asset: 'USD',
    payee: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const toISODateTime = (value?: string) => {
        if (!value) return new Date().toISOString();
        const s = String(value);
        if (s.includes('T')) return s;
        const timePart = new Date().toISOString().split('T')[1];
        return `${s}T${timePart}`;
      };
      const transactionData = {
        date: toISODateTime(formData.date),
        type: 'expense',
        quantity: '1',
        price_local: formData.amount,
        amount_local: formData.amount,
        asset: formData.asset,
        account: formData.account || 'Default',
        tag: formData.category,
        note: formData.note,
        counterparty: formData.payee || undefined,
        fx_to_usd: '1.0',
        fx_to_vnd: '24000.0',
        amount_usd: formData.amount,
        amount_vnd: (parseFloat(formData.amount || '0') * 24000).toFixed(2),
        fee_usd: '0',
        fee_vnd: '0'
      };

      await onSubmit(transactionData);
      onClose();
    } catch (error) {
      console.error('Error submitting expense:', error);
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
          <h3 className="text-lg font-medium text-gray-900">Quick Expense Entry</h3>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paying Account</label>
              <select
                value={formData.account}
                onChange={(e) => handleInputChange('account', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select account</option>
                {(accounts ?? []).filter((a: unknown) => {
                  const typedA = a as { is_active: boolean; name: string };
                  return typedA.is_active;
                }).map((a: unknown) => {
                  const typedA = a as { name: string };
                  return <option key={typedA.name} value={typedA.name}>{typedA.name}</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
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
                  return <option key={typedAs.symbol} value={typedAs.symbol}>{typedAs.symbol}{typedAs.name ? ` - ${typedAs.name}` : ''}</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select category</option>
                {tags?.filter(t => t.is_active).map(tag => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payee</label>
              <input
                type="text"
                value={formData.payee}
                onChange={(e) => handleInputChange('payee', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Merchant or recipient"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
              <input
                type="text"
                value={formData.note}
                onChange={(e) => handleInputChange('note', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="What was this expense for?"
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
              disabled={isSubmitting || !formData.amount || !formData.account}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickExpenseModal;