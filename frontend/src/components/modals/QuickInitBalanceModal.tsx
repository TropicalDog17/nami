import React, { useEffect, useMemo, useState } from 'react';

import ComboBox from '../ui/ComboBox';
import DateInput from '../ui/DateInput';
import { adminApi } from '../../services/api';

interface QuickInitBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: unknown) => Promise<void>;
}

const QuickInitBalanceModal: React.FC<QuickInitBalanceModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: today,
    asset: '',
    account: '',
    quantity: '',
    price_local: '',
    note: '',
  });
  const [assets, setAssets] = useState<{ value: string; label: string }[]>([]);
  const [accounts, setAccounts] = useState<{ value: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [assetsData, accountsData] = (await Promise.all([
          adminApi.listAssets(),
          adminApi.listAccounts(),
        ])) as [unknown[], unknown[]];
        setAssets((assetsData as { symbol: string; name?: string }[] || []).map((a: unknown) => {
          const typedA = a as { symbol: string; name?: string };
          return { value: typedA.symbol, label: `${typedA.symbol} - ${typedA.name ?? typedA.symbol}` };
        }));
        setAccounts((accountsData as { name: string; type?: string }[] || []).map((a: unknown) => {
          const typedA = a as { name: string; type?: string };
          return { value: typedA.name, label: `${typedA.name} (${typedA.type ?? 'Unknown'})` };
        }));
      } catch (_e) {
        setAssets([
          { value: 'USD', label: 'USD - U.S. Dollar' },
          { value: 'XAU', label: 'XAU - Gold (oz)' },
        ]);
        setAccounts([
          { value: 'Cash - USD', label: 'Cash - USD (bank)' },
          { value: 'Physical - Gold', label: 'Physical - Gold (asset)' },
        ]);
      }
    };
    if (isOpen) void load();
  }, [isOpen]);

  const validate = (): string | null => {
    if (!form.account) return 'Account is required';
    if (!form.asset) return 'Asset is required';
    if (!form.quantity || Number(form.quantity) <= 0) return 'Quantity must be > 0';
    if (!form.date) return 'Date is required';
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        date: form.date,
        account: form.account,
        asset: form.asset,
        quantity: parseFloat(form.quantity),
        note: form.note || undefined,
      };
      if (form.price_local && Number(form.price_local) > 0) {
        (payload as Record<string, unknown> & { price_local?: number }).price_local = parseFloat(form.price_local);
      }
      await onSubmit(payload);
      onClose();
      setForm({ date: today, asset: '', account: '', quantity: '', price_local: '', note: '' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Initialize Balance</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        {error && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <DateInput value={form.date} onChange={(v) => setForm((s) => ({ ...s, date: v }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
            <ComboBox
              options={accounts}
              value={form.account}
              onChange={(v) => setForm((s) => ({ ...s, account: String(v) }))}
              placeholder="Account"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asset</label>
            <ComboBox
              options={assets}
              value={form.asset}
              onChange={(v) => setForm((s) => ({ ...s, asset: String(v) }))}
              placeholder="Asset (e.g., XAU for Gold)"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 1"
                value={form.quantity}
                onChange={(e) => setForm((s) => ({ ...s, quantity: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (Local)</label>
              <input
                type="number"
                step="any"
                placeholder="optional (e.g. 2400 for 1 oz XAU)"
                value={form.price_local}
                onChange={(e) => setForm((s) => ({ ...s, price_local: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
              <div className="text-xs text-gray-500 mt-1">Leave blank to use defaults. For non-crypto assets like XAU, provide USD unit price.</div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <input
              type="text"
              placeholder="e.g., Starting balance"
              value={form.note}
              onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="flex space-x-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Creating...' : 'Create Balance'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickInitBalanceModal;


