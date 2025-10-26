import React, { useState } from 'react';

interface QuickInvestmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (investmentData: any) => void;
}

const QuickInvestmentModal: React.FC<QuickInvestmentModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const today = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    date: today,
    asset: 'USD',
    account: '',
    quantity: '',
    price_local: '1',
    horizon: '',
    note: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (k: string, v: string) => setFormData((s) => ({ ...s, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const qty = parseFloat(formData.quantity || '0');
      const price = parseFloat(formData.price_local || '1');
      const amount = qty * price;
      await onSubmit({
        date: formData.date,
        type: 'stake',
        asset: formData.asset,
        account: formData.account || 'Investment',
        quantity: qty,
        price_local: price,
        fx_to_usd: 1,
        fx_to_vnd: 1,
        amount_usd: amount,
        amount_vnd: amount,
        horizon: formData.horizon || null,
        note: formData.note || null,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Quick Investment (Stake)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
            <input type="number" step="any" value={formData.quantity} onChange={(e) => handleChange('quantity', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price (Local)</label>
            <input type="number" step="any" value={formData.price_local} onChange={(e) => handleChange('price_local', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input value={formData.note} onChange={(e) => handleChange('note', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex space-x-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting || !formData.quantity} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save Investment'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickInvestmentModal;


