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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { useApp } from '../../context/AppContext';

interface Asset {
    symbol: string;
    name: string;
    is_active: boolean;
}

interface QuickRepayModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: {
        date: string;
        amount: number;
        asset: string; // symbol
        counterparty?: string;
        note?: string;
        direction: 'BORROW' | 'LOAN';
    }) => Promise<void>;
    fixedDirection?: 'BORROW' | 'LOAN';
}

const QuickRepayModal: React.FC<QuickRepayModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    fixedDirection,
}) => {
    const { assets } = useApp();
    const today = new Date().toISOString().split('T')[0];

    const [form, setForm] = useState({
        date: today,
        amount: '',
        asset: 'USD',
        counterparty: '',
        note: '',
        direction: (fixedDirection ?? 'BORROW') as 'BORROW' | 'LOAN',
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (fixedDirection) {
            setForm((s) => ({ ...s, direction: fixedDirection }));
        }
    }, [fixedDirection]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.amount || Number(form.amount) <= 0) return;
        setSubmitting(true);
        try {
            const direction = fixedDirection ?? form.direction;
            await onSubmit({
                date: form.date,
                amount: Number(form.amount),
                asset: form.asset,
                counterparty: form.counterparty || undefined,
                note: form.note || undefined,
                direction,
            });
            onClose();
        } catch (_err) {
            // parent handles toast
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Quick Repay</DialogTitle>
                </DialogHeader>

                <form
                    onSubmit={(e) => void handleSubmit(e)}
                    className="space-y-4"
                >
                    <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Input
                            id="date"
                            type="date"
                            value={form.date}
                            onChange={(e) =>
                                setForm((s) => ({ ...s, date: e.target.value }))
                            }
                            required
                        />
                    </div>

                    {!fixedDirection && (
                        <div className="space-y-2">
                            <Label htmlFor="direction">Direction</Label>
                            <Select
                                value={form.direction}
                                onValueChange={(value) =>
                                    setForm((s) => ({
                                        ...s,
                                        direction: value as 'BORROW' | 'LOAN',
                                    }))
                                }
                            >
                                <SelectTrigger id="direction">
                                    <SelectValue placeholder="Select direction" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BORROW">
                                        Repay a Borrow (you owe)
                                    </SelectItem>
                                    <SelectItem value="LOAN">
                                        Collect a Loan (they owe you)
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount</Label>
                        <Input
                            id="amount"
                            type="number"
                            step="any"
                            value={form.amount}
                            onChange={(e) =>
                                setForm((s) => ({
                                    ...s,
                                    amount: e.target.value,
                                }))
                            }
                            placeholder="0.00"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="asset">Asset</Label>
                        <Select
                            value={form.asset}
                            onValueChange={(value) =>
                                setForm((s) => ({ ...s, asset: value }))
                            }
                        >
                            <SelectTrigger id="asset">
                                <SelectValue placeholder="Select asset" />
                            </SelectTrigger>
                            <SelectContent>
                                {(assets ?? [])
                                    .filter((as: Asset) => as.is_active)
                                    .map((as: Asset) => (
                                        <SelectItem
                                            key={as.symbol}
                                            value={as.symbol}
                                        >
                                            {as.symbol}
                                            {as.name ? ` - ${as.name}` : ''}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="counterparty">
                            Counterparty (optional)
                        </Label>
                        <Input
                            id="counterparty"
                            type="text"
                            value={form.counterparty}
                            onChange={(e) =>
                                setForm((s) => ({
                                    ...s,
                                    counterparty: e.target.value,
                                }))
                            }
                            placeholder="e.g., Alice"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="note">Note (optional)</Label>
                        <Input
                            id="note"
                            type="text"
                            value={form.note}
                            onChange={(e) =>
                                setForm((s) => ({ ...s, note: e.target.value }))
                            }
                            placeholder="Description"
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
                        <Button
                            type="submit"
                            disabled={submitting || !form.amount}
                        >
                            {submitting ? 'Saving…' : 'Save Repayment'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default QuickRepayModal;
