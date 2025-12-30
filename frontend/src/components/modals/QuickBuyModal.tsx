import React, { useEffect, useState, useMemo } from 'react';

import { useApp } from '../../context/AppContext';
import { actionsApi } from '../../services/api';
import ComboBox from '../ui/ComboBox';
import DateInput from '../ui/DateInput';

interface QuickBuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: (result: unknown) => void;
}

const QuickBuyModal: React.FC<QuickBuyModalProps> = ({ isOpen, onClose, onSubmitted }) => {
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
        return { value: typedA.symbol, label: `${typedA.symbol} - ${typedA.name ?? ''}` };
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Quick Buy (Spot)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <DateInput value={date} onChange={(v) => setDate(v)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Exchange Account</label>
            <ComboBox options={exchangeOptions} value={exchangeAccount} onChange={setExchangeAccount} placeholder="Select exchange" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Asset</label>
              <ComboBox
                options={assetOptions}
                value={baseAsset}
                onChange={(v) => setBaseAsset(v.toUpperCase())}
                placeholder="Select asset"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quote Asset</label>
              <ComboBox
                options={assetOptions}
                value={quoteAsset}
                onChange={(v) => setQuoteAsset(v.toUpperCase())}
                placeholder="Select asset"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity ({baseAsset})</label>
              <input type="number" step="any" className="w-full px-3 py-2 border rounded-md" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price ({quoteAsset})</label>
              <input type="number" step="any" className="w-full px-3 py-2 border rounded-md" value={priceQuote} onChange={(e) => setPriceQuote(e.target.value)} placeholder="Auto if empty" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fee % (optional)</label>
            <input type="number" step="any" className="w-full px-3 py-2 border rounded-md" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} />
          </div>
          <div className="flex space-x-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting || !exchangeAccount || !baseAsset || !quoteAsset || !quantity} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Buy'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickBuyModal;
