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
import { toISODateTime, getTodayDate } from '../../utils/dateUtils';

interface FormData {
  date: string;
  amount: string;
  note: string;
  account: string;
  asset: string;
  payer: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;  // Changed to Record to match transactionData
}

const QuickIncomeModal = ({ isOpen, onClose, onSubmit }: Props) => {
  const { accounts, assets } = useApp() as { accounts: Array<{ is_active: boolean; name: string; type?: string }>; assets: Array<{ is_active: boolean; symbol: string; name?: string }> };
  const today = getTodayDate();

  const [formData, setFormData] = useState<FormData>({
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
        amount_vnd: (parseFloat(formData.amount ?? '0') * 24000).toFixed(2),
        fee_usd: '0',
        fee_vnd: '0',
      };
      await onSubmit(transactionData as Record<string, unknown>);
      onClose();
    } catch (_err) {
      // Handle error or ignore
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Income Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
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
              <Label htmlFor="account">Receiving Account</Label>
              <Select value={formData.account} onValueChange={(value) => handleInputChange('account', value)} required>
                <SelectTrigger id="account">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.filter(a => a.is_active).map(a => (
                    <SelectItem key={a.name} value={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset">Currency</Label>
              <Select value={formData.asset} onValueChange={(value) => handleInputChange('asset', value)}>
                <SelectTrigger id="asset">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {assets.filter(a => a.is_active).map(a => (
                    <SelectItem key={a.symbol} value={a.symbol}>
                      {a.symbol} - {a.name ?? ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payer">Income Source</Label>
              <Input
                id="payer"
                type="text"
                value={formData.payer}
                onChange={(e) => handleInputChange('payer', e.target.value)}
                placeholder="Employer, Client, Platform"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                type="text"
                value={formData.note}
                onChange={(e) => handleInputChange('note', e.target.value)}
                placeholder="Optional details (e.g., September payroll)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !formData.amount || !formData.account}>
              {isSubmitting ? 'Saving...' : 'Save Income'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuickIncomeModal;


