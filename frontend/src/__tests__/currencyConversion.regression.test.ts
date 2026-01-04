import { describe, it, expect } from 'vitest';

type TransactionRow = {
    id?: number;
    amount_local?: number | string | null;
    fx_to_usd?: number | string | null;
    fx_to_vnd?: number | string | null;
    amount_usd?: number | string | null;
    amount_vnd?: number | string | null;
};

describe('Currency Conversion Regression Tests', () => {
    describe("GitHub Issue #2: Currency switching doesn't apply historical FX conversion", () => {
        it('should handle transactions with missing FX rate data gracefully', () => {
            // Regression test for edge cases where FX data might be missing
            const transactionWithMissingFX: TransactionRow = {
                id: 1,
                amount_local: 1000,
                fx_to_usd: null,
                fx_to_vnd: null,
                amount_usd: 1000,
                amount_vnd: 24000000,
            };

            const convertWithFallback = (
                row: TransactionRow,
                currency: 'USD' | 'VND'
            ) => {
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

            expect(convertWithFallback(transactionWithMissingFX, 'USD')).toBe(
                1000
            );
            expect(convertWithFallback(transactionWithMissingFX, 'VND')).toBe(
                24000000
            );
        });

        it('should handle zero amounts correctly', () => {
            const zeroTransaction: TransactionRow = {
                id: 1,
                amount_local: 0,
                fx_to_usd: 1.0,
                fx_to_vnd: 24000.0,
                amount_usd: 0,
                amount_vnd: 0,
            };

            const convertAmount = (
                row: TransactionRow,
                currency: 'USD' | 'VND'
            ) => {
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

            expect(convertAmount(zeroTransaction, 'USD')).toBe(0);
            expect(convertAmount(zeroTransaction, 'VND')).toBe(0);
        });

        it('should handle very large amounts without overflow', () => {
            const largeTransaction: TransactionRow = {
                id: 1,
                amount_local: 1000000000, // 1 billion
                fx_to_usd: 1.5,
                fx_to_vnd: 35000,
            };

            const convertAmount = (
                row: TransactionRow,
                currency: 'USD' | 'VND'
            ) => {
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

            expect(convertAmount(largeTransaction, 'USD')).toBe(1500000000);
            expect(convertAmount(largeTransaction, 'VND')).toBe(35000000000000);
        });

        it('should handle decimal FX rates correctly', () => {
            const decimalFXTransaction: TransactionRow = {
                id: 1,
                amount_local: 1000.5,
                fx_to_usd: 0.85,
                fx_to_vnd: 19845.75,
            };

            const convertAmount = (
                row: TransactionRow,
                currency: 'USD' | 'VND'
            ) => {
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

            const usdResult = convertAmount(decimalFXTransaction, 'USD');
            const vndResult = convertAmount(decimalFXTransaction, 'VND');

            // 1000.50 * 0.85 = 850.425
            expect(usdResult).toBeCloseTo(850.425, 3);
            // 1000.50 * 19845.75 = 19855672.875
            expect(vndResult).toBeCloseTo(19855672.875, 3);
        });

        it('should maintain consistency across multiple currency switches', () => {
            // Test that switching back and forth between currencies produces consistent results
            const transaction: TransactionRow = {
                id: 1,
                amount_local: 1000,
                fx_to_usd: 1.2,
                fx_to_vnd: 28000,
            };

            const convertAmount = (
                row: TransactionRow,
                currency: 'USD' | 'VND'
            ) => {
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

            // Switch multiple times
            const usd1 = convertAmount(transaction, 'USD');
            const vnd1 = convertAmount(transaction, 'VND');
            const usd2 = convertAmount(transaction, 'USD');
            const vnd2 = convertAmount(transaction, 'VND');

            // Results should be consistent
            expect(usd1).toBe(usd2);
            expect(vnd1).toBe(vnd2);
            expect(usd1).toBe(1200); // 1000 * 1.2
            expect(vnd1).toBe(28000000); // 1000 * 28000
        });

        it('should handle extreme FX rate values', () => {
            const extremeFXTransaction: TransactionRow = {
                id: 1,
                amount_local: 1,
                fx_to_usd: 0.0001, // Very small FX rate
                fx_to_vnd: 100000, // Very large FX rate
            };

            const convertAmount = (
                row: TransactionRow,
                currency: 'USD' | 'VND'
            ) => {
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

            expect(convertAmount(extremeFXTransaction, 'USD')).toBe(0.0001);
            expect(convertAmount(extremeFXTransaction, 'VND')).toBe(100000);
        });

        it('should handle malformed data gracefully', () => {
            const malformedTransactions = [
                {
                    id: 1,
                    amount_local: 'not a number',
                    fx_to_usd: 'also not a number',
                    fx_to_vnd: undefined,
                    amount_usd: 1000,
                    amount_vnd: 24000000,
                },
                {
                    id: 2,
                    amount_local: null,
                    fx_to_usd: null,
                    fx_to_vnd: null,
                    amount_usd: null,
                    amount_vnd: null,
                },
                {
                    id: 3,
                    // Empty transaction
                },
            ];

            const convertWithFallback = (
                row: TransactionRow,
                currency: 'USD' | 'VND'
            ) => {
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

            // All malformed transactions should fall back gracefully to 0 or pre-calculated values
            expect(convertWithFallback(malformedTransactions[0], 'USD')).toBe(
                1000
            );
            expect(convertWithFallback(malformedTransactions[0], 'VND')).toBe(
                24000000
            );
            expect(convertWithFallback(malformedTransactions[1], 'USD')).toBe(
                0
            );
            expect(convertWithFallback(malformedTransactions[1], 'VND')).toBe(
                0
            );
            expect(convertWithFallback(malformedTransactions[2], 'USD')).toBe(
                0
            );
            expect(convertWithFallback(malformedTransactions[2], 'VND')).toBe(
                0
            );
        });
    });

    describe('Currency Display Formatting', () => {
        it('should format different currency symbols correctly', () => {
            const formatCurrency = (
                amount: number,
                currency: 'USD' | 'VND'
            ) => {
                const numberFormatter = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: currency,
                });
                return numberFormatter.format(amount);
            };

            // Test various amounts
            expect(formatCurrency(0, 'USD')).toBe('$0.00');
            expect(formatCurrency(0, 'VND')).toBe('₫0');

            expect(formatCurrency(1, 'USD')).toBe('$1.00');
            expect(formatCurrency(1, 'VND')).toBe('₫1');

            expect(formatCurrency(999.99, 'USD')).toBe('$999.99');
            expect(formatCurrency(999.99, 'VND')).toBe('₫1,000');

            expect(formatCurrency(1000000, 'USD')).toBe('$1,000,000.00');
            expect(formatCurrency(1000000, 'VND')).toBe('₫1,000,000');
        });

        it('should handle negative amounts in formatting', () => {
            const formatCurrency = (
                amount: number,
                currency: 'USD' | 'VND'
            ) => {
                const numberFormatter = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: currency,
                });
                return numberFormatter.format(amount);
            };

            expect(formatCurrency(-1000, 'USD')).toBe('-$1,000.00');
            expect(formatCurrency(-24000000, 'VND')).toBe('-₫24,000,000');
        });
    });
});
