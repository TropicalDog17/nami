import { useState } from 'react';
import { transactionApi } from '../services/api';

export const useSmartTransaction = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTransaction = async (transactionData: any) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await transactionApi.create(transactionData);
      return response;
    } catch (err: any) {
      setError(err.message || 'Failed to create transaction');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createTransaction,
    isLoading,
    error
  };
};