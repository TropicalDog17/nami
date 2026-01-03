import React, { useState, KeyboardEvent, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useApp } from '../../context/AppContext';
import { vaultApi } from '../../services/api';
import { toISODateTime, getTodayDate } from '../../utils/dateUtils';

interface QuickExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (transactionData: unknown) => Promise<void>;
  // If provided, prefill the Paying Vault with this account name (e.g., 'Spend' or 'Borrowings')
  defaultAccount?: string;
}

const ADD_NEW_VALUE = '__ADD_NEW__';

type SimpleVault = { name?: string; id?: string; status?: string };

const QuickExpenseModal: React.FC<QuickExpenseModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  defaultAccount,
}) => {
  const { assets, tags, actions } = useApp();
  const today = getTodayDate();

  const [_vaults, _setVaults] = useState<SimpleVault[]>([]);
  const _isLoadingVaults = useState<boolean>(false)[0];
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

    // Always set account to Spend for expenses
    setFormData(prev => ({ ...prev, account: 'Spend' }));

    const loadVaults = async () => {
      try {
        setVaultsError(null);
        // Prefer active vaults only
        const list = await vaultApi.getActiveVaults<SimpleVault[]>({ is_open: true });
        let arr = (list ?? []).map(v => ({ name: (v.name ?? (v as { id?: string }).id) as string, id: (v as { id?: string }).id ?? v.name, status: v.status }))
          .filter(v => !!v.name);

        // Ensure the defaultAccount (if provided) is present in the list so it shows in the dropdown
        if (defaultAccount && !arr.find(v => v.name === defaultAccount)) {
          arr = [{ name: defaultAccount, id: defaultAccount, status: 'active' }, ...arr];
        }

        _setVaults(arr);
      } catch (e) {
        const msg = (e as { message?: string } | null)?.message ?? 'Failed to load vaults';
        setVaultsError(msg);
      } finally {
        // This is intentional - the variable is used to prevent concurrent loads
        // eslint-disable-next-line react-hooks/exhaustive-deps
        _isLoadingVaults = false;
      }
    };
    void loadVaults();
  }, [isOpen, defaultAccount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
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

  const onNewCategoryKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      void saveNewCategory();
    } else if (ev.key === 'Escape') {
      setIsAddingCategory(false);
      setNewCategory('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Expense Entry</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date (optional)</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => handleInputChange('dueDate', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account">
                Paying Vault
                <span className="ml-2 text-xs font-normal text-blue-600">
                  (All expenses use Spend vault)
                </span>
              </Label>
              <Select
                value={formData.account}
                onValueChange={(value) => handleInputChange('account', value)}
                required
                disabled={true}
              >
                <SelectTrigger id="account" className="bg-muted cursor-not-allowed">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <option value="Spend">💰 Spend</option>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Expenses are automatically withdrawn from your Spend vault
              </p>
              {vaultsError ? (
                <p className="text-sm text-destructive mt-1">{vaultsError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset">Currency</Label>
              <Select
                value={formData.asset}
                onValueChange={(value) => handleInputChange('asset', value)}
              >
                <SelectTrigger id="asset">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {(assets ?? []).filter((as: unknown) => {
                    const typedAs = as as { is_active: boolean };
                    return typedAs.is_active;
                  }).map((as: unknown) => {
                    const typedAs = as as { symbol: string; name?: string };
                    return <option key={typedAs.symbol} value={typedAs.symbol}>{typedAs.symbol}{typedAs.name ? ` - ${typedAs.name}` : ''}</option>;
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              {!isAddingCategory ? (
                <Select
                  value={formData.category}
                  onValueChange={(value) => onCategoryChange(value)}
                  required
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <option value="">Select category</option>
                    {tags?.filter(t => t.is_active).map(tag => (
                      <option key={tag.name} value={tag.name}>
                        {tag.name}
                      </option>
                    ))}
                    <option value={ADD_NEW_VALUE}>+ Add new category…</option>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={onNewCategoryKey}
                    className="flex-1"
                    placeholder="New category name"
                    autoFocus
                  />
                  <Button
                    type="button"
                    onClick={() => void saveNewCategory()}
                    disabled={isSavingCategory || !newCategory.trim()}
                  >
                    {isSavingCategory ? 'Adding…' : 'Add'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setIsAddingCategory(false); setNewCategory(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {categoryError ? (
                <p className="text-sm text-destructive mt-1">{categoryError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="payee">Payee</Label>
              <Input
                id="payee"
                type="text"
                value={formData.payee}
                onChange={(e) => handleInputChange('payee', e.target.value)}
                placeholder="Merchant or recipient"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                type="text"
                value={formData.note}
                onChange={(e) => handleInputChange('note', e.target.value)}
                placeholder="What was this expense for?"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !formData.amount || !formData.account}>
              {isSubmitting ? 'Saving...' : 'Save Expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuickExpenseModal;
