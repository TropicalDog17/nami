import React, { useEffect, useMemo, useState } from 'react';
import ComboBox from './ui/ComboBox';
import DateInput from './ui/DateInput';
import { adminApi } from '../services/api';

interface QuickVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (vaultData: any) => void;
}

const QuickVaultModal: React.FC<QuickVaultModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUsdOnly, setIsUsdOnly] = useState(false);
  const [form, setForm] = useState({
    asset: '',
    account: '',
    horizon: '',
    depositQty: '',
    depositCost: '',
    date: today,
  });
  const [assets, setAssets] = useState<{ value: string; label: string }[]>([]);
  const [accounts, setAccounts] = useState<{ value: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load master data when opening
  useEffect(() => {
    const load = async () => {
      try {
        const [assetsData, accountsData] = (await Promise.all([
          adminApi.listAssets(),
          adminApi.listAccounts(),
        ])) as [any[], any[]];
        setAssets((assetsData || []).map((a: any) => ({ value: a.symbol, label: `${a.symbol} - ${a.name || a.symbol}` })));
        setAccounts((accountsData || []).map((a: any) => ({ value: a.name, label: `${a.name} (${a.type})` })));
      } catch (e) {
        setAssets([
          { value: 'BTC', label: 'BTC - Bitcoin' },
          { value: 'ETH', label: 'ETH - Ethereum' },
          { value: 'USD', label: 'USD - U.S. Dollar' },
        ]);
        setAccounts([
          { value: 'Cash - USD', label: 'Cash - USD (bank)' },
          { value: 'Binance', label: 'Binance (exchange)' },
        ]);
      }
    };
    if (isOpen) load();
  }, [isOpen]);

  const unitCost = useMemo(() => {
    const qty = parseFloat(form.depositQty || '');
    const cost = parseFloat(form.depositCost || '');
    if (!qty || !cost || qty <= 0 || cost <= 0) return null;
    return cost / qty;
  }, [form.depositQty, form.depositCost]);

  const validate = (): string | null => {
    if (!form.account) return 'Account is required';
    if (!isUsdOnly && !form.asset) return 'Asset is required';
    if (!form.depositCost || Number(form.depositCost) <= 0) return 'Deposit cost must be > 0';
    if (!isUsdOnly && (!form.depositQty || Number(form.depositQty) <= 0)) return 'Deposit quantity must be > 0';
    if (!form.date) return 'Date is required';
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const payload = {
        asset: isUsdOnly ? 'USD' : form.asset,
        account: form.account,
        horizon: form.horizon || null,
        depositQty: isUsdOnly ? 1 : parseFloat(form.depositQty),
        depositCost: parseFloat(form.depositCost),
        date: form.date,
      };
      await onSubmit(payload);
      onClose();
      setForm({ asset: '', account: '', horizon: '', depositQty: '', depositCost: '', date: today });
      setIsUsdOnly(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Create New Vault</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        {error && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center">
            <label className="flex items-center text-sm text-gray-700">
              <input
                type="checkbox"
                className="mr-2"
                checked={isUsdOnly}
                onChange={(e) => {
                  const next = e.target.checked;
                  setIsUsdOnly(next);
                  setForm((s) => ({ ...s, asset: next ? 'USD' : '', depositQty: next ? '1' : '' }));
                }}
              />
              USD-only mode (track by USD; Quantity fixed to 1)
            </label>
          </div>
          {!isUsdOnly && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asset</label>
              <ComboBox
                options={assets}
                value={form.asset}
                onChange={(v) => setForm((s) => ({ ...s, asset: String(v) }))}
                placeholder="Asset"
              />
            </div>
          )}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Horizon (optional)</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              value={form.horizon}
              onChange={(e) => setForm((s) => ({ ...s, horizon: e.target.value }))}
            >
              <option value="">Select…</option>
              <option value="short-term">Short-term</option>
              <option value="long-term">Long-term</option>
              <option value="speculative">Speculative</option>
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {isUsdOnly ? (
              <div className="px-3 py-2 border rounded-md bg-gray-50 text-gray-700 flex items-center">Quantity fixed to 1</div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deposit Quantity</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 10.5"
                  value={form.depositQty}
                  onChange={(e) => setForm((s) => ({ ...s, depositQty: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deposit Cost (USD)</label>
              <input
                type="number"
                step="any"
                placeholder="Total invested USD"
                value={form.depositCost}
                onChange={(e) => setForm((s) => ({ ...s, depositCost: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
          {!!unitCost && !isUsdOnly && (
            <div className="text-xs text-gray-500">Unit cost preview: ${unitCost.toLocaleString(undefined, { maximumFractionDigits: 8 })} per unit</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <DateInput value={form.date} onChange={(v) => setForm((s) => ({ ...s, date: v }))} />
          </div>
          <div className="flex space-x-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Creating...' : 'Create Vault'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickVaultModal;


