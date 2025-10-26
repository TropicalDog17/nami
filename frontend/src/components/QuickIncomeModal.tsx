import React, { useState } from 'react';

import { useApp } from '../context/AppContext';

interface QuickIncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (transactionData: any) => void;
}

const QuickIncomeModal: React.FC<QuickIncomeModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const { accounts, assets } = useApp() as any;
  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    date: today,
    amount: '',
    note: '',
    account: '',
    asset: 'USD',
    payer: '', // counterparty/source of income
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

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
        type: 'income',
        quantity: '1',
        price_local: formData.amount,
        amount_local: formData.amount,
        asset: formData.asset,
        account: formData.account || 'Default',
        note: formData.note,
        counterparty: formData.payer || undefined,
        fx_to_usd: '1.0',
        fx_to_vnd: '24000.0',
        amount_usd: formData.amount,
        amount_vnd: (parseFloat(formData.amount || '0') * 24000).toFixed(2),
        fee_usd: '0',
        fee_vnd: '0',
      };
      await onSubmit(transactionData);
      onClose();
    } catch (err) {
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Quick Income Entry</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={formData.date} onChange={(e) => handleInputChange('date', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input type="number" step="0.01" value={formData.amount} onChange={(e) => handleInputChange('amount', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Receiving Account</label>
              <select value={formData.account} onChange={(e) => handleInputChange('account', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                <option value="">Select account</option>
                {accounts?.filter((a: any) => a.is_active).map((a: any) => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={formData.asset} onChange={(e) => handleInputChange('asset', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                {(assets || []).filter((as: any) => as.is_active).map((as: any) => (
                  <option key={as.symbol} value={as.symbol}>{as.symbol} {as.name ? `- ${as.name}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Income Source</label>
              <input type="text" value={formData.payer} onChange={(e) => handleInputChange('payer', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Employer, Client, Platform" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
              <input type="text" value={formData.note} onChange={(e) => handleInputChange('note', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional details (e.g., September payroll)" />
            </div>
          </div>
          <div className="flex space-x-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting || !formData.amount || !formData.account} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save Income'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickIncomeModal;


