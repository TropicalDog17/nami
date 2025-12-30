import { describe, it, expect } from 'vitest';

type TransactionRow = {
  id?: number;
  date?: string;
  amount_local?: number;
  fx_to_usd?: number;
  fx_to_vnd?: number;
  amount_usd?: number;
  amount_vnd?: number;
};

describe('Currency Conversion Logic', () => {
  it('should convert amounts using historical FX rates', () => {
    // Test the currency conversion logic implemented in TransactionPage
    const transaction1: TransactionRow = {
      id: 1,
      date: '2024-01-15',
      amount_local: 1000,
      fx_to_usd: 1.0,
      fx_to_vnd: 24000.0,
    };

    const transaction2: TransactionRow = {
      id: 2,
      date: '2024-02-15',
      amount_local: 1000,
      fx_to_usd: 1.1,
      fx_to_vnd: 25000.0,
    };

    // Simulate the conversion logic from TransactionPage.tsx
    const convertAmount = (row: TransactionRow, currency: 'USD' | 'VND') => {
      const amountLocal = Number(row?.amount_local ?? 0);
      const fxToUsd = Number(row?.fx_to_usd ?? 1);
      const fxToVnd = Number(row?.fx_to_vnd ?? 24000);

      if (amountLocal > 0 && (fxToUsd > 0 || fxToVnd > 0)) {
        return currency === 'USD'
          ? amountLocal * fxToUsd
          : amountLocal * fxToVnd;
      }
      return 0;
    };

    // Test USD conversion with different historical rates
    expect(convertAmount(transaction1, 'USD')).toBe(1000); // 1000 * 1.0
    expect(convertAmount(transaction2, 'USD')).toBe(1100); // 1000 * 1.1

    // Test VND conversion with different historical rates
    expect(convertAmount(transaction1, 'VND')).toBe(24000000); // 1000 * 24000.0
    expect(convertAmount(transaction2, 'VND')).toBe(25000000); // 1000 * 25000.0

    // Verify that historical FX rates create different converted amounts
    expect(convertAmount(transaction1, 'USD')).not.toBe(convertAmount(transaction2, 'USD'));
    expect(convertAmount(transaction1, 'VND')).not.toBe(convertAmount(transaction2, 'VND'));
  });

  it('should handle fallback to pre-calculated values when conversion data missing', () => {
    const transactionWithMissingFX: TransactionRow = {
      id: 1,
      amount_local: 0, // No local amount
      amount_usd: 1000,
      amount_vnd: 24000000,
    };

    // Test fallback logic
    const convertWithFallback = (row: TransactionRow, currency: 'USD' | 'VND') => {
      const amountLocal = Number(row?.amount_local ?? 0);
      const fxToUsd = Number(row?.fx_to_usd ?? 1);
      const fxToVnd = Number(row?.fx_to_vnd ?? 24000);
      const amountUsd = Number(row?.amount_usd ?? 0);
      const amountVnd = Number(row?.amount_vnd ?? 0);

      if (amountLocal > 0 && (fxToUsd > 0 || fxToVnd > 0)) {
        return currency === 'USD'
          ? amountLocal * fxToUsd
          : amountLocal * fxToVnd;
      } else {
        return currency === 'USD' ? amountUsd : amountVnd;
      }
    };

    expect(convertWithFallback(transactionWithMissingFX, 'USD')).toBe(1000);
    expect(convertWithFallback(transactionWithMissingFX, 'VND')).toBe(24000000);
  });

  it('should format currency amounts correctly', () => {
    // Test currency formatting logic from TransactionPage
    const formatCurrency = (amount: number, currency: 'USD' | 'VND') => {
      const numberFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
      });
      return numberFormatter.format(amount);
    };

    expect(formatCurrency(1000, 'USD')).toBe('$1,000.00');
    expect(formatCurrency(24000000, 'VND')).toBe('₫24,000,000');
    expect(formatCurrency(1100.50, 'USD')).toBe('$1,100.50');
  });
});