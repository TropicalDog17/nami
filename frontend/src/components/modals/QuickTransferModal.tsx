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
import { getTodayDate } from '../../utils/dateUtils';

interface QuickTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: unknown) => Promise<void>;
}

const QuickTransferModal: React.FC<QuickTransferModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const { accounts, assets } = useApp();
  const today = getTodayDate();

  const [formData, setFormData] = useState({
    date: today,
    quantity: '',
    from_account: '',
    to_account: '',
    asset: 'USD',
    fee: '0',
    note: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Transfer action expects:
      // from_account, to_account, asset, quantity, fee? (optional), date, note
      const payload = {
        action: 'transfer',
        params: {
            from_account: formData.from_account,
            to_account: formData.to_account,
            asset: formData.asset,
            quantity: parseFloat(formData.quantity),
            fee: parseFloat(formData.fee || '0'),
            date: formData.date, // YYYY-MM-DD is fine for action, backend handles it? 
            // verifying backend action date handling: it unwraps body.
            // actually backend actions.ts uses new Date(params.date || ...)
            // so YYYY-MM-DD is OK.
            note: formData.note
        }
      };
      
      // We pass the payload to onSubmit. 
      // Note: The parent handleQuickTransferSubmit usually calls the API.
      // But here we constructed the full payload.
      // Parent expects just the params probably? 
      // QuickExpenseModal constructs a fake transactionData to call createExpense.
      // Here we want to call actionsApi.perform('transfer', params).
      // So we should just pass params.
      
      await onSubmit(payload.params);
      onClose();
      // Reset form
      setFormData({
        date: today,
        quantity: '',
        from_account: '',
        to_account: '',
        asset: 'USD',
        fee: '0',
        note: ''
      });
    } catch (error) {
      console.error('Error submitting transfer:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Funds</DialogTitle>
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

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="any"
                    value={formData.quantity}
                    onChange={(e) => handleInputChange('quantity', e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asset">Asset</Label>
                  <Select
                    value={formData.asset}
                    onValueChange={(value) => handleInputChange('asset', value)}
                  >
                    <SelectTrigger id="asset">
                      <SelectValue placeholder="Select asset" />
                    </SelectTrigger>
                    <SelectContent>
                      {(assets ?? []).filter((as: unknown) => {
                        const typedAs = as as { is_active: boolean };
                        return typedAs.is_active;
                      }).map((as: unknown) => {
                        const typedAs = as as { symbol: string; name?: string };
                        return <option key={typedAs.symbol} value={typedAs.symbol}>{typedAs.symbol}</option>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from_account">From Account</Label>
              <Select
                value={formData.from_account}
                onValueChange={(value) => handleInputChange('from_account', value)}
                required
              >
                <SelectTrigger id="from_account">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).filter((a: unknown) => {
                     const typedA = a as { is_active: boolean };
                     return typedA.is_active;
                  }).map((a: unknown) => {
                     const typedA = a as { name: string; type: string };
                     return <option key={typedA.name} value={typedA.name}>{typedA.name} ({typedA.type})</option>;
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="to_account">To Account</Label>
              <Select
                value={formData.to_account}
                onValueChange={(value) => handleInputChange('to_account', value)}
                required
              >
                <SelectTrigger id="to_account">
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).filter((a: unknown) => {
                     const typedA = a as { is_active: boolean; name: string };
                     return typedA.is_active && typedA.name !== formData.from_account;
                  }).map((a: unknown) => {
                     const typedA = a as { name: string; type: string };
                     return <option key={typedA.name} value={typedA.name}>{typedA.name} ({typedA.type})</option>;
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fee">Fee (optional)</Label>
              <Input
                id="fee"
                type="number"
                step="any"
                value={formData.fee}
                onChange={(e) => handleInputChange('fee', e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                type="text"
                value={formData.note}
                onChange={(e) => handleInputChange('note', e.target.value)}
                placeholder="Description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !formData.quantity || !formData.from_account || !formData.to_account}>
              {isSubmitting ? 'Transferring...' : 'Transfer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuickTransferModal;
