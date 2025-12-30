import React, { useState } from 'react';

import { useApp } from '../../context/AppContext';

interface QuickRepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    date: string;
    amount: number;
    account?: string;
    asset: string; // symbol
    counterparty?: string;
    note?: string;
    direction: 'BORROW' | 'LOAN';
  }) => Promise<void>;
}

const QuickRepayModal: React.FC<QuickRepayModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const { accounts, assets } = useApp();
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    date: today,
    amount: '',
    account: '',
    asset: 'USD',
    counterparty: '',
    note: '',
    direction: 'BORROW' as 'BORROW' | 'LOAN',
  });
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    setSubmitting(true);
    try {
      await onSubmit({
        date: form.date,
        amount: Number(form.amount),
        account: form.account || undefined,
        asset: form.asset,
        counterparty: form.counterparty || undefined,
        note: form.note || undefined,
        direction: form.direction,
      });
      onClose();
    } catch (err) {
      // parent handles toast
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Quick Repay</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Direction</label>
            <select
              value={form.direction}
              onChange={(e) => setForm((s) => ({ ...s, direction: e.target.value as 'BORROW' | 'LOAN' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="BORROW">Repay a Borrow (you owe)</option>
              <option value="LOAN">Collect a Loan (they owe you)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <input
              type="number"
              step="any"
              value={form.amount}
              onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
            <select
              value={form.account}
              onChange={(e) => setForm((s) => ({ ...s, account: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select account</option>
              {(accounts ?? []).filter((a: any) => a.is_active).map((a: any) => (
                <option key={a.name} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asset</label>
            <select
              value={form.asset}
              onChange={(e) => setForm((s) => ({ ...s, asset: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(assets ?? []).filter((as: any) => as.is_active).map((as: any) => (
                <option key={as.symbol} value={as.symbol}>{as.symbol}{as.name ? ` - ${as.name}` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Counterparty (optional)</label>
            <input
              type="text"
              value={form.counterparty}
              onChange={(e) => setForm((s) => ({ ...s, counterparty: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Alice"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Description"
            />
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
              disabled={submitting || !form.amount}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save Repayment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickRepayModal;

