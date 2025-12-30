import React, { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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

import { adminApi } from '../../services/api';
import { getTodayDate } from '../../utils/dateUtils';
import ComboBox from '../ui/ComboBox';
import DateInput from '../ui/DateInput';

interface QuickVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (vaultData: Record<string, unknown>) => void;
}

const QuickVaultModal: React.FC<QuickVaultModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const today = getTodayDate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUsdOnly, setIsUsdOnly] = useState(false);
  const [form, setForm] = useState({
    name: '',
    asset: '',
    horizon: '',
    depositQty: '',
    depositCost: '',
    date: today,
  });
  const [assets, setAssets] = useState<{ value: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load master data when opening
  useEffect(() => {
    const load = async () => {
      try {
        const assetsData = await adminApi.listAssets();
        const assetList = (assetsData ?? []) as Array<{ symbol?: string; name?: string }>;
        setAssets(assetList.map((a) => {
          const symbol = String(a.symbol ?? '');
          const name = String(a.name ?? symbol);
          return { value: symbol, label: `${symbol} - ${name}` };
        }));
      } catch (_e) {
        setAssets([
          { value: 'BTC', label: 'BTC - Bitcoin' },
          { value: 'ETH', label: 'ETH - Ethereum' },
          { value: 'USD', label: 'USD - U.S. Dollar' },
        ]);
      }
    };
    if (isOpen) void load();
  }, [isOpen]);

  const unitCost = useMemo(() => {
    const qty = parseFloat(form.depositQty ?? '');
    const cost = parseFloat(form.depositCost ?? '');
    if (!qty || !cost || qty <= 0 || cost <= 0) return null;
    return cost / qty;
  }, [form.depositQty, form.depositCost]);

  const validate = (): string | null => {
    if (!form.name) return 'Name is required';
    if (!isUsdOnly && !form.asset) return 'Asset is required';
    if (!form.depositCost || Number(form.depositCost) <= 0) return 'Deposit cost must be > 0';
    if (!isUsdOnly && (!form.depositQty || Number(form.depositQty) <= 0)) return 'Deposit quantity must be > 0';
    if (!form.date) return 'Date is required';
    return null;
  };

  const submit = (e: React.FormEvent) => {
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
        name: form.name,
        asset: isUsdOnly ? 'USD' : form.asset,
        horizon: form.horizon ?? null,
        depositQty: isUsdOnly ? 1 : parseFloat(form.depositQty ?? ''),
        depositCost: parseFloat(form.depositCost ?? ''),
        date: form.date,
      };
      onSubmit(payload);
      onClose();
      setForm({ asset: '', horizon: '', depositQty: '', depositCost: '', date: today });
      setIsUsdOnly(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Vault</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="mb-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">{error}</div>
        )}
        <form onSubmit={(e) => { void submit(e); }} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Unique vault name"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isUsdOnly"
              checked={isUsdOnly}
              onCheckedChange={(checked) => {
                const next = Boolean(checked);
                setIsUsdOnly(next);
                setForm((s) => ({ ...s, asset: next ? 'USD' : '', depositQty: next ? '1' : '' }));
              }}
            />
            <Label htmlFor="isUsdOnly" className="cursor-pointer">USD-only mode (track by USD; Quantity fixed to 1)</Label>
          </div>
          {!isUsdOnly && (
            <div className="space-y-2">
              <Label htmlFor="asset">Asset</Label>
              <ComboBox
                options={assets}
                value={form.asset}
                onChange={(v) => setForm((s) => ({ ...s, asset: String(v) }))}
                placeholder="Asset"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="horizon">Horizon (optional)</Label>
            <Select
              value={form.horizon}
              onValueChange={(value) => setForm((s) => ({ ...s, horizon: value }))}
            >
              <SelectTrigger id="horizon">
                <SelectValue placeholder="Select horizon" />
              </SelectTrigger>
              <SelectContent>
                <option value="">Select…</option>
                <option value="short-term">Short-term</option>
                <option value="long-term">Long-term</option>
                <option value="speculative">Speculative</option>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {isUsdOnly ? (
              <div className="px-3 py-2 border rounded-md bg-muted text-foreground flex items-center">Quantity fixed to 1</div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="depositQty">Deposit Quantity</Label>
                <Input
                  id="depositQty"
                  type="number"
                  step="any"
                  placeholder="e.g. 10.5"
                  value={form.depositQty}
                  onChange={(e) => setForm((s) => ({ ...s, depositQty: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="depositCost">Deposit Cost (USD)</Label>
              <Input
                id="depositCost"
                type="number"
                step="any"
                placeholder="Total invested USD"
                value={form.depositCost}
                onChange={(e) => setForm((s) => ({ ...s, depositCost: e.target.value }))}
              />
            </div>
          </div>
          {!!unitCost && !isUsdOnly && (
            <div className="text-xs text-muted-foreground">Unit cost preview: ${unitCost.toLocaleString(undefined, { maximumFractionDigits: 8 })} per unit</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <DateInput value={form.date} onChange={(v) => setForm((s) => ({ ...s, date: v }))} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create Vault'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuickVaultModal;


