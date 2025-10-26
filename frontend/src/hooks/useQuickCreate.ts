import { useState } from 'react';

import { transactionApi, vaultApi, investmentsApi } from '../services/api';

export const useQuickCreate = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createExpense = async (data: any) => {
    setIsLoading(true); setError(null);
    try { return await transactionApi.create(data); } catch (e: any) { setError(e?.message ?? 'Failed'); throw e; } finally { setIsLoading(false); }
  };

  const createIncome = async (data: any) => {
    setIsLoading(true); setError(null);
    try { return await transactionApi.create(data); } catch (e: any) { setError(e?.message ?? 'Failed'); throw e; } finally { setIsLoading(false); }
  };

  const createVault = async (data: any) => {
    setIsLoading(true); setError(null);
    try { return await vaultApi.createVault(data); } catch (e: any) { setError(e?.message ?? 'Failed'); throw e; } finally { setIsLoading(false); }
  };

  const createInvestment = async (data: any) => {
    setIsLoading(true); setError(null);
    try { return await investmentsApi.stake(data); } catch (e: any) { setError(e?.message ?? 'Failed'); throw e; } finally { setIsLoading(false); }
  };

  return { isLoading, error, createExpense, createIncome, createVault, createInvestment };
};


