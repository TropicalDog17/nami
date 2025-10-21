import { useState } from 'react';
import { transactionsApi } from '../services/api';

export const useQuickExpense = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createExpense = async (expenseData: any) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await transactionsApi.create(expenseData);
      return response;
    } catch (err: any) {
      setError(err.message || 'Failed to create expense');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createExpense,
    isLoading,
    error
  };
};