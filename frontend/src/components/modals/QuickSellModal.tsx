import React, { useEffect, useState } from 'react';

import ComboBox from '../ui/ComboBox';
import DateInput from '../ui/DateInput';
import { transactionApi } from '../../services/api';

interface QuickSellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: (result: unknown) => void;
}

const QuickSellModal: React.FC<QuickSellModalProps> = ({ isOpen, onClose, onSubmitted }) => {
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
    if (!exchangeAccount || !baseAsset || !quantity || !unitPriceUSD) return;
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Quick Sell (Spot)</h3>
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
              <input className="w-full px-3 py-2 border rounded-md" value={baseAsset} onChange={(e) => setBaseAsset(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input type="number" step="any" className="w-full px-3 py-2 border rounded-md" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (USD)</label>
            <input type="number" step="any" className="w-full px-3 py-2 border rounded-md" value={unitPriceUSD} onChange={(e) => setUnitPriceUSD(e.target.value)} required />
          </div>
          <div className="flex space-x-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting || !exchangeAccount || !baseAsset || !quantity || !unitPriceUSD} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Sell'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickSellModal;
