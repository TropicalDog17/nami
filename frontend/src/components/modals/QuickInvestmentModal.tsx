import React, { useEffect, useMemo, useState } from 'react';

import ComboBox from '../ui/ComboBox';
import { adminApi, tokenizedVaultApi } from '../../services/api';

interface QuickInvestmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (investmentData: unknown) => void;
}

const QuickInvestmentModal: React.FC<QuickInvestmentModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const today = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    date: today,
    vaultId: '',
    asset: 'USD',
    account: '',
    quantity: '',
    price_local: '1',
    horizon: '',
    note: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vaultOptions, setVaultOptions] = useState<{ value: string; label: string }[]>([]);
  const [vaultIdToInfo, setVaultIdToInfo] = useState<Record<string, { id: string; name: string; token_symbol: string }>>({});
  const [accountOptions, setAccountOptions] = useState<{ value: string; label: string }[]>([]);
  const [isUsdOnly, setIsUsdOnly] = useState(false);
  const [usdAmount, setUsdAmount] = useState('');

  const handleChange = (k: string, v: string) => setFormData((s) => ({ ...s, [k]: v }));

  // Load tokenized vaults and accounts when modal opens
  useEffect(() => {
    const load = async () => {
      try {
        const [vaults, accounts] = await Promise.all([
          tokenizedVaultApi.list<Array<{ id: string; name: string; token_symbol: string }>>() ,
          adminApi.listAccounts<Array<{ name: string; type: string }>>()
        ]);

        const byId: Record<string, { id: string; name: string; token_symbol: string }> = {};
        const opts = (vaults ?? []).map((v) => {
          byId[v.id] = { id: v.id, name: v.name, token_symbol: v.token_symbol };
          return { value: v.id, label: `${v.name} (${v.token_symbol})` };
        });
        setVaultIdToInfo(byId);
        setVaultOptions(opts);

        const accOpts = (accounts ?? []).map((a) => ({ value: a.name, label: `${a.name} (${a.type})` }));
        setAccountOptions(accOpts);
      } catch (_e) {
        setVaultOptions([]);
        setAccountOptions([]);
      }
    };
    if (isOpen) void load();
  }, [isOpen]);

  // When vault changes, reflect asset/account for user clarity
  const selectedVault = useMemo(() => {
    return formData.vaultId ? vaultIdToInfo[formData.vaultId] : null;
  }, [formData.vaultId, vaultIdToInfo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (!formData.vaultId) {
        throw new Error('Select a vault');
      }
      const qty = isUsdOnly ? 1 : parseFloat(formData.quantity ?? '0');
      const cost = isUsdOnly ? parseFloat(usdAmount ?? '0') : parseFloat(formData.quantity ?? '0') * parseFloat(formData.price_local ?? '1');
      if (!cost || cost <= 0) {
        throw new Error('Enter a valid amount');
      }
      onSubmit({  // removed await
        vaultId: formData.vaultId,
        quantity: qty,
        cost,
        note: formData.note || null,
        date: formData.date,
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
          <h3 className="text-lg font-medium text-gray-900">Deposit to Vault</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vault</label>
            <ComboBox
              options={vaultOptions}
              value={formData.vaultId}
              onChange={(val) => handleChange('vaultId', val)}
              placeholder="Select a vault"
            />
            {selectedVault && (
              <div className="mt-1 text-xs text-gray-500">
                Selected: {selectedVault.name} ({selectedVault.token_symbol})
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source Account</label>
            <ComboBox
              options={accountOptions}
              value={formData.account}
              onChange={(val) => handleChange('account', String(val))}
              placeholder="Select source account"
              allowCreate
              onCreate={async (name) => {
                await adminApi.createAccount({ name, type: 'bank', is_active: true });
                const accounts = await adminApi.listAccounts<Array<{ name: string; type: string }>>();
                setAccountOptions((accounts ?? []).map((a) => ({ value: a.name, label: `${a.name} (${a.type})` })));
                handleChange('account', name);
              }}
            />
          </div>

          <div className="flex items-center">
            <label className="flex items-center text-sm text-gray-700">
              <input type="checkbox" className="mr-2" checked={isUsdOnly} onChange={(e) => setIsUsdOnly(e.target.checked)} />
              USD-only deposit (enter USD amount only)
            </label>
          </div>
          <div>
            {isUsdOnly ? (
              <>
                <label htmlFor="usd-amount" className="block text-sm font-medium text-gray-700 mb-1">Amount (USD)</label>
                <input id="usd-amount" aria-label="Amount (USD)" type="number" step="any" value={usdAmount} onChange={(e) => setUsdAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <div className="mt-1 text-xs text-gray-500">Quantity is fixed to 1 in USD-only mode.</div>
              </>
            ) : (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input type="number" step="any" value={formData.quantity} onChange={(e) => handleChange('quantity', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </>
            )}
          </div>
          {!isUsdOnly && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price (Local)</label>
              <input type="number" step="any" value={formData.price_local} onChange={(e) => handleChange('price_local', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input value={formData.note} onChange={(e) => handleChange('note', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex space-x-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting || !formData.vaultId || (!isUsdOnly && !formData.quantity) || (isUsdOnly && !usdAmount)} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save Deposit'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickInvestmentModal;


