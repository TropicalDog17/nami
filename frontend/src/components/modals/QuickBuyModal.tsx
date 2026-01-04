import React, { useEffect, useState, useMemo } from 'react';

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

import { useApp } from '../../context/AppContext';
import { actionsApi } from '../../services/api';
import ComboBox from '../ui/ComboBox';
import DateInput from '../ui/DateInput';

interface QuickBuyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmitted?: (result: unknown) => void;
}

const QuickBuyModal: React.FC<QuickBuyModalProps> = ({
    isOpen,
    onClose,
    onSubmitted,
}) => {
    const today = new Date().toISOString().split('T')[0];
    const { assets } = useApp();
    const [date, setDate] = useState<string>(today);
    const [exchangeAccount, setExchangeAccount] = useState<string>('Binance');
    const [baseAsset, setBaseAsset] = useState<string>('BTC');
    const [quoteAsset, setQuoteAsset] = useState<string>('USD');
    const [quantity, setQuantity] = useState<string>('');
    const [priceQuote, setPriceQuote] = useState<string>('');
    const [feePercent, setFeePercent] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const exchangeOptions = [
        { value: 'Binance', label: 'Binance' },
        { value: 'Coinbase', label: 'Coinbase' },
    ];

    const assetOptions = useMemo(() => {
        const opts = (assets ?? [])
            .filter((a: unknown) => (a as { is_active: boolean }).is_active)
            .map((a: unknown) => {
                const typedA = a as { symbol: string; name?: string };
                return {
                    value: typedA.symbol,
                    label: `${typedA.symbol} - ${typedA.name ?? ''}`,
                };
            });
        // Fallbacks in case master data hasn't loaded yet
        if (opts.length === 0) {
            return [
                { value: 'BTC', label: 'BTC - Bitcoin' },
                { value: 'ETH', label: 'ETH - Ethereum' },
                { value: 'USD', label: 'USD - US Dollar' },
                { value: 'VND', label: 'VND - Vietnamese Dong' },
            ];
        }
        return opts;
    }, [assets]);

    useEffect(() => {
        if (!isOpen) {
            setDate(today);
            setExchangeAccount('');
            setBaseAsset('BTC');
            setQuoteAsset('USD');
            setQuantity('');
            setPriceQuote('');
            setFeePercent('');
        }
    }, [isOpen, today]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!exchangeAccount || !baseAsset || !quoteAsset || !quantity) return;
        setIsSubmitting(true);
        try {
            const params: Record<string, unknown> = {
                date,
                exchange_account: exchangeAccount,
                base_asset: baseAsset,
                quote_asset: quoteAsset,
                quantity: parseFloat(quantity),
            };
            if (priceQuote) params.price_quote = parseFloat(priceQuote);
            if (feePercent) params.fee_percent = parseFloat(feePercent);
            const resp = await actionsApi.perform('spot_buy', params);
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
                    <DialogTitle>Quick Buy (Spot)</DialogTitle>
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
                            <ComboBox
                                options={assetOptions}
                                value={baseAsset}
                                onChange={(v) => setBaseAsset(v.toUpperCase())}
                                placeholder="Select asset"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="quoteAsset">Quote Asset</Label>
                            <ComboBox
                                options={assetOptions}
                                value={quoteAsset}
                                onChange={(v) => setQuoteAsset(v.toUpperCase())}
                                placeholder="Select asset"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="quantity">
                                Quantity ({baseAsset})
                            </Label>
                            <Input
                                id="quantity"
                                type="number"
                                step="any"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="priceQuote">
                                Unit Price ({quoteAsset})
                            </Label>
                            <Input
                                id="priceQuote"
                                type="number"
                                step="any"
                                value={priceQuote}
                                onChange={(e) => setPriceQuote(e.target.value)}
                                placeholder="Auto if empty"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="feePercent">Fee % (optional)</Label>
                        <Input
                            id="feePercent"
                            type="number"
                            step="any"
                            value={feePercent}
                            onChange={(e) => setFeePercent(e.target.value)}
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
                                !quoteAsset ||
                                !quantity
                            }
                        >
                            {isSubmitting ? 'Saving...' : 'Buy'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default QuickBuyModal;
