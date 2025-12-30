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

import { adminApi, tokenizedVaultApi } from '../../services/api';
import ComboBox from '../ui/ComboBox';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (!formData.vaultId) {
        throw new Error('Select a vault');
      }
      const isTokenized = formData.vaultId.startsWith('vault_');
      if (isTokenized && !formData.account) {
        throw new Error('Please choose a source account');
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
        account: formData.account || undefined,
        note: formData.note || null,
        date: formData.date,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Deposit to Vault</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vaultId">Vault</Label>
            <ComboBox
              options={vaultOptions}
              value={formData.vaultId}
              onChange={(val) => handleChange('vaultId', val)}
              placeholder="Select a vault"
            />
            {selectedVault && (
              <div className="mt-1 text-xs text-muted-foreground">
                Selected: {selectedVault.name} ({selectedVault.token_symbol})
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="account">Source Account</Label>
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

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isUsdOnly"
              checked={isUsdOnly}
              onCheckedChange={(checked) => setIsUsdOnly(Boolean(checked))}
            />
            <Label htmlFor="isUsdOnly" className="cursor-pointer">USD-only deposit (enter USD amount only)</Label>
          </div>
          <div>
            {isUsdOnly ? (
              <>
                <Label htmlFor="usd-amount">Amount (USD)</Label>
                <Input
                  id="usd-amount"
                  aria-label="Amount (USD)"
                  type="number"
                  step="any"
                  value={usdAmount}
                  onChange={(e) => setUsdAmount(e.target.value)}
                  required
                />
                <div className="mt-1 text-xs text-muted-foreground">Quantity is fixed to 1 in USD-only mode.</div>
              </>
            ) : (
              <>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="any"
                  value={formData.quantity}
                  onChange={(e) => handleChange('quantity', e.target.value)}
                  required
                />
              </>
            )}
          </div>
          {!isUsdOnly && (
            <div className="space-y-2">
              <Label htmlFor="price_local">Price (Local)</Label>
              <Input
                id="price_local"
                type="number"
                step="any"
                value={formData.price_local}
                onChange={(e) => handleChange('price_local', e.target.value)}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              value={formData.note}
              onChange={(e) => handleChange('note', e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !formData.vaultId || (!isUsdOnly && !formData.quantity) || (isUsdOnly && !usdAmount)}>
              {isSubmitting ? 'Saving...' : 'Save Deposit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuickInvestmentModal;


