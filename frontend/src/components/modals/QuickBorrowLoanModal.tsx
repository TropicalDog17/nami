import React, { useState } from 'react';

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

interface QuickBorrowLoanModalProps {
    isOpen: boolean;
    mode: 'borrow' | 'loan';
    onClose: () => void;
    onSubmit: (data: {
        startDate: string;
        firstDueDate?: string;
        amount: number;
        monthlyPayment?: number;
        asset: string; // symbol
        counterparty?: string;
        note?: string;
    }) => Promise<void>;
}

const QuickBorrowLoanModal: React.FC<QuickBorrowLoanModalProps> = ({
    isOpen,
    mode,
    onClose,
    onSubmit,
}) => {
    const { assets } = useApp();
    const today = new Date().toISOString().split('T')[0];

    const [form, setForm] = useState({
        startDate: today,
        firstDueDate: today,
        amount: '',
        monthlyPayment: '',
        asset: 'USD',
        counterparty: '',
        note: '',
    });
    const [submitting, setSubmitting] = useState(false);

    const title = mode === 'borrow' ? 'Borrowing Agreement' : 'Quick Loan';
    const cta = mode === 'borrow' ? 'Save Borrowing' : 'Save Loan';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.amount || Number(form.amount) <= 0) return;
        if (
            mode === 'borrow' &&
            form.monthlyPayment &&
            Number(form.monthlyPayment) <= 0
        )
            return;
        setSubmitting(true);
        try {
            await onSubmit({
                startDate: form.startDate,
                firstDueDate: form.firstDueDate,
                amount: Number(form.amount),
                monthlyPayment:
                    mode === 'borrow' && form.monthlyPayment
                        ? Number(form.monthlyPayment)
                        : undefined,
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

                <form
                    onSubmit={(e) => void handleSubmit(e)}
                    className="space-y-4"
                >
                    <div className="space-y-2">
                        <Label htmlFor="start-date">
                            {mode === 'borrow' ? 'Start Date' : 'Date'}
                        </Label>
                        <Input
                            id="start-date"
                            type="date"
                            value={form.startDate}
                            onChange={(e) =>
                                setForm((s) => ({
                                    ...s,
                                    startDate: e.target.value,
                                }))
                            }
                            required
                        />
                    </div>

                    {mode === 'borrow' && (
                        <div className="space-y-2">
                            <Label htmlFor="first-due-date">
                                First Due Date
                            </Label>
                            <Input
                                id="first-due-date"
                                type="date"
                                value={form.firstDueDate}
                                onChange={(e) =>
                                    setForm((s) => ({
                                        ...s,
                                        firstDueDate: e.target.value,
                                    }))
                                }
                                required
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="amount">
                            {mode === 'borrow' ? 'Principal' : 'Amount'}
                        </Label>
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

                    {mode === 'borrow' && (
                        <div className="space-y-2">
                            <Label htmlFor="monthly-payment">
                                Estimated Monthly Payment
                            </Label>
                            <Input
                                id="monthly-payment"
                                type="number"
                                step="any"
                                value={form.monthlyPayment}
                                onChange={(e) =>
                                    setForm((s) => ({
                                        ...s,
                                        monthlyPayment: e.target.value,
                                    }))
                                }
                                placeholder="0.00 (optional)"
                            />
                            <p className="text-xs text-gray-500">
                                Used for cashflow prediction only.
                            </p>
                        </div>
                    )}

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
