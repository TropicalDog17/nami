import React, { useEffect, useState } from 'react';

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

import { adminApi } from '../../services/api';
import { getTodayDate } from '../../utils/dateUtils';
import ComboBox from '../ui/ComboBox';
import DateInput from '../ui/DateInput';

interface QuickInitBalanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (params: unknown) => Promise<void>;
}

const QuickInitBalanceModal: React.FC<QuickInitBalanceModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
}) => {
    const today = getTodayDate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [form, setForm] = useState({
        date: today,
        asset: '',
        account: '',
        quantity: '',
        price_local: '',
        note: '',
    });
    const [assets, setAssets] = useState<{ value: string; label: string }[]>(
        []
    );
    const [accounts, setAccounts] = useState<
        { value: string; label: string }[]
    >([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const [assetsData, accountsData] = (await Promise.all([
                    adminApi.listAssets(),
                    adminApi.listAccounts(),
                ])) as [unknown[], unknown[]];
                setAssets(
                    (
                        (assetsData as { symbol: string; name?: string }[]) ||
                        []
                    ).map((a: unknown) => {
                        const typedA = a as { symbol: string; name?: string };
                        return {
                            value: typedA.symbol,
                            label: `${typedA.symbol} - ${typedA.name ?? typedA.symbol}`,
                        };
                    })
                );
                setAccounts(
                    (
                        (accountsData as { name: string; type?: string }[]) ||
                        []
                    ).map((a: unknown) => {
                        const typedA = a as { name: string; type?: string };
                        return {
                            value: typedA.name,
                            label: `${typedA.name} (${typedA.type ?? 'Unknown'})`,
                        };
                    })
                );
            } catch (_e) {
                setAssets([
                    { value: 'USD', label: 'USD - U.S. Dollar' },
                    { value: 'XAU', label: 'XAU - Gold (oz)' },
                ]);
                setAccounts([
                    { value: 'Cash - USD', label: 'Cash - USD (bank)' },
                    {
                        value: 'Physical - Gold',
                        label: 'Physical - Gold (asset)',
                    },
                ]);
            }
        };
        if (isOpen) void load();
    }, [isOpen]);

    const validate = (): string | null => {
        if (!form.account) return 'Account is required';
        if (!form.asset) return 'Asset is required';
        if (!form.quantity || Number(form.quantity) <= 0)
            return 'Quantity must be > 0';
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
            const payload: Record<string, unknown> = {
                date: form.date,
                account: form.account,
                asset: form.asset,
                quantity: parseFloat(form.quantity),
                note: form.note || undefined,
            };
            if (form.price_local && Number(form.price_local) > 0) {
                (
                    payload as Record<string, unknown> & {
                        price_local?: number;
                    }
                ).price_local = parseFloat(form.price_local);
            }
            await onSubmit(payload);
            onClose();
            setForm({
                date: today,
                asset: '',
                account: '',
                quantity: '',
                price_local: '',
                note: '',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Initialize Balance</DialogTitle>
                </DialogHeader>
                {error && (
                    <div className="mb-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
                        {error}
                    </div>
                )}
                <form onSubmit={(e) => void submit(e)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <DateInput
                            value={form.date}
                            onChange={(v) =>
                                setForm((s) => ({ ...s, date: v }))
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="account">Account</Label>
                        <ComboBox
                            options={accounts}
                            value={form.account}
                            onChange={(v) =>
                                setForm((s) => ({ ...s, account: String(v) }))
                            }
                            placeholder="Account"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="asset">Asset</Label>
                        <ComboBox
                            options={assets}
                            value={form.asset}
                            onChange={(v) =>
                                setForm((s) => ({ ...s, asset: String(v) }))
                            }
                            placeholder="Asset (e.g., XAU for Gold)"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="quantity">Quantity</Label>
                            <Input
                                id="quantity"
                                type="number"
                                step="any"
                                placeholder="e.g. 1"
                                value={form.quantity}
                                onChange={(e) =>
                                    setForm((s) => ({
                                        ...s,
                                        quantity: e.target.value,
                                    }))
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="price_local">
                                Unit Price (Local)
                            </Label>
                            <Input
                                id="price_local"
                                type="number"
                                step="any"
                                placeholder="optional (e.g. 2400 for 1 oz XAU)"
                                value={form.price_local}
                                onChange={(e) =>
                                    setForm((s) => ({
                                        ...s,
                                        price_local: e.target.value,
                                    }))
                                }
                            />
                            <div className="text-xs text-muted-foreground">
                                Leave blank to use defaults. For non-crypto
                                assets like XAU, provide USD unit price.
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="note">Note (optional)</Label>
                        <Input
                            id="note"
                            type="text"
                            placeholder="e.g., Starting balance"
                            value={form.note}
                            onChange={(e) =>
                                setForm((s) => ({ ...s, note: e.target.value }))
                            }
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Creating...' : 'Create Balance'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default QuickInitBalanceModal;
