import React, { useState, KeyboardEvent, useEffect } from 'react';

import { useApp } from '../../context/AppContext';
import { vaultApi } from '../../services/api';

interface QuickExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (transactionData: unknown) => Promise<void>;
}

const ADD_NEW_VALUE = '__ADD_NEW__';

type SimpleVault = { name?: string; id?: string; status?: string };

const QuickExpenseModal: React.FC<QuickExpenseModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const { assets, tags, actions } = useApp();
  const today = new Date().toISOString().split('T')[0];

  const [vaults, setVaults] = useState<SimpleVault[]>([]);
  const [isLoadingVaults, setIsLoadingVaults] = useState<boolean>(false);
  const [vaultsError, setVaultsError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    date: today,
    dueDate: '',
    amount: '',
    category: '',
    note: '',
    account: '', // now represents the paying vault name
    asset: 'USD',
    payee: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add-new-category inline state
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const loadVaults = async () => {
      try {
        setIsLoadingVaults(true);
        setVaultsError(null);
        // Prefer active vaults only
        const list = await vaultApi.getActiveVaults<SimpleVault[]>({ is_open: true });
        const arr = (list ?? []).map(v => ({ name: (v.name ?? (v as any).id) as string, id: (v as any).id ?? v.name, status: v.status }))
          .filter(v => !!v.name);
        setVaults(arr);
        // Default paying vault if none selected
        setFormData(prev => ({ ...prev, account: prev.account || (arr[0]?.name ?? '') }));
      } catch (e) {
        const msg = (e as { message?: string } | null)?.message ?? 'Failed to load vaults';
        setVaultsError(msg);
      } finally {
        setIsLoadingVaults(false);
      }
    };
    void loadVaults();
  }, [isOpen]);

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
        // For income/expense, backend expects the amount in 'quantity' units of the asset
        quantity: formData.amount, // e.g., 42.50 USD
        price_local: '1',
        amount_local: formData.amount,
        asset: formData.asset,
        account: formData.account, // vault name
        // Support both legacy 'tag' and new 'category'
        tag: formData.category,
        category: formData.category,
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

  const onCategoryChange = (value: string) => {
    if (value === ADD_NEW_VALUE) {
      setIsAddingCategory(true);
      setCategoryError(null);
      return;
    }
    handleInputChange('category', value);
  };

  const saveNewCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    try {
      setIsSavingCategory(true);
      setCategoryError(null);
      await actions.createTag({ name, is_active: true });
      handleInputChange('category', name);
      setIsAddingCategory(false);
      setNewCategory('');
    } catch (e: unknown) {
      const msg = (e as { message?: string } | null)?.message ?? 'Failed to add category';
      setCategoryError(msg);
    } finally {
      setIsSavingCategory(false);
    }
  };

  const onNewCategoryKey = async (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      await saveNewCategory();
    } else if (ev.key === 'Escape') {
      setIsAddingCategory(false);
      setNewCategory('');
    }
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (optional)</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => handleInputChange('dueDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Paying Vault</label>
              <select
                value={formData.account}
                onChange={(e) => handleInputChange('account', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">{isLoadingVaults ? 'Loading vaults…' : 'Select vault'}</option>
                {vaults.map((v) => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
              {vaultsError ? (
                <p className="text-sm text-red-600 mt-1">{vaultsError}</p>
              ) : null}
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
              {!isAddingCategory ? (
                <select
                  value={formData.category}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select category</option>
                  {tags?.filter(t => t.is_active).map(tag => (
                    <option key={tag.name} value={tag.name}>
                      {tag.name}
                    </option>
                  ))}
                  <option value={ADD_NEW_VALUE}>+ Add new category…</option>
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={onNewCategoryKey}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="New category name"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => void saveNewCategory()}
                    disabled={isSavingCategory || !newCategory.trim()}
                    className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {isSavingCategory ? 'Adding…' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingCategory(false); setNewCategory(''); }}
                    className="px-3 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {categoryError ? (
                <p className="text-sm text-red-600 mt-1">{categoryError}</p>
              ) : null}
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
