import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useApp } from '../../context/AppContext';

interface Account {
  name: string;
  is_active: boolean;
}

interface Asset {
  symbol: string;
  name: string;
  is_active: boolean;
}

interface QuickBorrowLoanModalProps {
  isOpen: boolean;
  mode: 'borrow' | 'loan';
  onClose: () => void;
  onSubmit: (data: {
    date: string;
    amount: number;
    account?: string;
    asset: string; // symbol
    counterparty?: string;
    note?: string;
  }) => Promise<void>;
}

const QuickBorrowLoanModal: React.FC<QuickBorrowLoanModalProps> = ({ isOpen, mode, onClose, onSubmit }) => {
  const { accounts, assets } = useApp();
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    date: today,
    amount: '',
    account: '',
    asset: 'USD',
    counterparty: '',
    note: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const title = mode === 'borrow' ? 'Quick Borrow' : 'Quick Loan';
  const cta = mode === 'borrow' ? 'Save Borrow' : 'Save Loan';

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
      });
      onClose();
    } catch (_err) {
      // parent shows toast
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="any"
              value={form.amount}
              onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="account">Account</Label>
            <Select
              value={form.account}
              onValueChange={(value) => setForm((s) => ({ ...s, account: value }))}
            >
              <SelectTrigger id="account">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                <option value="">Select account</option>
                {(accounts ?? []).filter((a: Account) => a.is_active).map((a: Account) => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset">Asset</Label>
            <Select
              value={form.asset}
              onValueChange={(value) => setForm((s) => ({ ...s, asset: value }))}
            >
              <SelectTrigger id="asset">
                <SelectValue placeholder="Select asset" />
              </SelectTrigger>
              <SelectContent>
                {(assets ?? []).filter((as: Asset) => as.is_active).map((as: Asset) => (
                  <option key={as.symbol} value={as.symbol}>{as.symbol}{as.name ? ` - ${as.name}` : ''}</option>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="counterparty">Counterparty (optional)</Label>
            <Input
              id="counterparty"
              type="text"
              value={form.counterparty}
              onChange={(e) => setForm((s) => ({ ...s, counterparty: e.target.value }))}
              placeholder="e.g., Alice"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Input
              id="note"
              type="text"
              value={form.note}
              onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
              placeholder="Description"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !form.amount}>
              {submitting ? 'Saving…' : cta}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuickBorrowLoanModal;

