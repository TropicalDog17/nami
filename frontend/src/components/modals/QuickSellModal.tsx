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

import { transactionApi } from '../../services/api';
import ComboBox from '../ui/ComboBox';
import DateInput from '../ui/DateInput';

interface QuickSellModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmitted?: (result: unknown) => void;
}

const QuickSellModal: React.FC<QuickSellModalProps> = ({
    isOpen,
    onClose,
    onSubmitted,
}) => {
    const today = new Date().toISOString().split('T')[0];
    const [date, setDate] = useState<string>(today);
    const [exchangeAccount, setExchangeAccount] = useState<string>('');
    const [baseAsset, setBaseAsset] = useState<string>('BTC');
    const [quantity, setQuantity] = useState<string>('');
    const [unitPriceUSD, setUnitPriceUSD] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const exchangeOptions = [
        { value: 'Binance', label: 'Binance' },
        { value: 'Coinbase', label: 'Coinbase' },
    ];

    useEffect(() => {
        if (!isOpen) {
            setDate(today);
            setExchangeAccount('');
            setBaseAsset('BTC');
            setQuantity('');
            setUnitPriceUSD('');
        }
    }, [isOpen, today]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!exchangeAccount || !baseAsset || !quantity || !unitPriceUSD)
            return;
        setIsSubmitting(true);
        try {
            const tx = {
                date: `${date}T00:00:00Z`,
                type: 'sell',
                asset: baseAsset,
                account: exchangeAccount,
                quantity: parseFloat(quantity),
                price_local: parseFloat(unitPriceUSD),
                fx_to_usd: 1,
                fx_to_vnd: 1,
            } as Record<string, unknown>;
            const resp = await transactionApi.create(tx);
            if (onSubmitted) onSubmitted(resp);
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Quick Sell (Spot)</DialogTitle>
                </DialogHeader>
                <form
                    onSubmit={(e) => void handleSubmit(e)}
                    className="space-y-4"
                >
                    <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <DateInput value={date} onChange={(v) => setDate(v)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="exchangeAccount">
                            Exchange Account
                        </Label>
                        <ComboBox
                            options={exchangeOptions}
                            value={exchangeAccount}
                            onChange={setExchangeAccount}
                            placeholder="Select exchange"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="baseAsset">Base Asset</Label>
                            <Input
                                id="baseAsset"
                                value={baseAsset}
                                onChange={(e) =>
                                    setBaseAsset(e.target.value.toUpperCase())
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="quantity">Quantity</Label>
                            <Input
                                id="quantity"
                                type="number"
                                step="any"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="unitPriceUSD">Unit Price (USD)</Label>
                        <Input
                            id="unitPriceUSD"
                            type="number"
                            step="any"
                            value={unitPriceUSD}
                            onChange={(e) => setUnitPriceUSD(e.target.value)}
                            required
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
                            disabled={
                                isSubmitting ||
                                !exchangeAccount ||
                                !baseAsset ||
                                !quantity ||
                                !unitPriceUSD
                            }
                        >
                            {isSubmitting ? 'Saving...' : 'Sell'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default QuickSellModal;
