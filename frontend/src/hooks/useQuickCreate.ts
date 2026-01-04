import { useState } from 'react';

import { transactionApi, vaultApi } from '../services/api';

export const useQuickCreate = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createExpense = async (data: Record<string, unknown>) => {
        setIsLoading(true);
        setError(null);
        try {
            return await transactionApi.create(data);
        } catch (e: unknown) {
            const msg = (e as { message?: string } | null)?.message ?? 'Failed';
            setError(msg);
            throw e;
        } finally {
            setIsLoading(false);
        }
    };

    const createIncome = async (data: Record<string, unknown>) => {
        setIsLoading(true);
        setError(null);
        try {
            return await transactionApi.create(data);
        } catch (e: unknown) {
            const msg = (e as { message?: string } | null)?.message ?? 'Failed';
            setError(msg);
            throw e;
        } finally {
            setIsLoading(false);
        }
    };

    const createVault = async (data: Record<string, unknown>) => {
        setIsLoading(true);
        setError(null);
        try {
            return await vaultApi.createVault(data);
        } catch (e: unknown) {
            const msg = (e as { message?: string } | null)?.message ?? 'Failed';
            setError(msg);
            throw e;
        } finally {
            setIsLoading(false);
        }
    };

    return { isLoading, error, createExpense, createIncome, createVault };
};
