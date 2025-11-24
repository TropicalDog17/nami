import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import CreditCardSummary from '../components/CreditCardSummary';
import DataTable, { TableColumn } from '../components/ui/DataTable';
import { useBackendStatus } from '../context/BackendStatusContext';
import { adminApi, transactionApi } from '../services/api';

interface CreditCard {
  id: string;
  name: string;
  outstandingBalance: number;
  availableCredit: number;
  creditLimit: number;
  minimumPayment: number;
  dueDate: string;
  apr: number;
}

const CreditDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditAccounts, setCreditAccounts] = useState<string[]>([]);

  const { isOnline } = useBackendStatus();

  useEffect(() => {
    if (isOnline) {
      void loadAccountsAndData();
    }
  }, [isOnline]);

  const fetchCreditData = useCallback(async (accountsFilter?: string[]) => {
    setLoading(true);
    setError(null);

    try {
      // Fetch credit transactions (expenses and repay_borrow) scoped to credit card accounts
      const accountsParam = (accountsFilter?.length > 0)
        ? { accounts: accountsFilter }
        : {} as Record<string, unknown>;

      const [expensesResponseRaw, repayResponseRaw] = await Promise.all([
        transactionApi.list({ types: 'expense', limit: 100, ...accountsParam }),
        transactionApi.list({ types: 'repay_borrow', limit: 100, ...accountsParam })
      ]);

      const expensesResponse = (expensesResponseRaw as Record<string, unknown>[]) ?? [];
      const repayResponse = (repayResponseRaw as Record<string, unknown>[]) ?? [];

      // Client-side safety filter
      const allowedAccounts = accountsFilter ?? creditAccounts;
      const filteredExpenses = allowedAccounts && allowedAccounts.length > 0
        ? expensesResponse.filter((t: unknown) => {
            const typedT = t as { account?: string };
            return allowedAccounts.includes(String((typedT.account ?? '')));
          })
        : [];
      const filteredRepay = allowedAccounts && allowedAccounts.length > 0
        ? repayResponse.filter((t: unknown) => {
            const typedT = t as { account?: string };
            return allowedAccounts.includes(String((typedT.account ?? '')));
          })
        : [];

      // Process transactions
      const allCreditTransactions = [
        ...filteredExpenses,
        ...filteredRepay
      ].sort((a: unknown, b: unknown) => {
        const typedA = a as { date: string };
        const typedB = b as { date: string };
        return new Date(String(typedA.date ?? '')).getTime() - new Date(String(typedB.date ?? '')).getTime();
      }).slice(0, 50);

      setCreditTransactions(allCreditTransactions);
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message ?? 'Failed to fetch credit data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [creditAccounts]);

  const loadAccountsAndData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const accounts = await adminApi.listAccounts() as Array<{ type?: string; name: string }>;
      const cardNames = accounts
        .filter((a: unknown) => {
          const typedA = a as { type?: string };
          return String(typedA.type ?? '').toLowerCase() === 'creditcard';
        })
        .map((a: unknown) => {
          const typedA = a as { name: string };
          return String((typedA.name ?? ''));
        });
      setCreditAccounts(cardNames);

      // If there are no credit card accounts configured, show empty state
      if (!cardNames || cardNames.length === 0) {
        setCreditCards([]);
        setCreditTransactions([]);
        setLoading(false);
        return;
      }

      await fetchCreditData(cardNames);
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message ?? 'Failed to load credit accounts';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [fetchCreditData]);

  const transactionColumns: TableColumn<Record<string, unknown>>[] = [
    { key: 'date', title: 'Date', render: (value) => new Date(String(value)).toLocaleDateString() },
    { key: 'type', title: 'Type', render: (value) => String(value) === 'expense' ? 'Charge' : 'Payment' },
    { key: 'account', title: 'Card' },
    { key: 'counterparty', title: 'Merchant' },
    {
      key: 'amount_usd',
      title: 'Amount',
      render: (value: unknown, _col: TableColumn<Record<string, unknown>>, row: Record<string, unknown>) => {
        const amount = parseFloat(String((value as number ?? 0)));
        const sign = String((row.type as string) ?? '') === 'expense' ? '-' : '+';
        return `${sign}$${Math.abs(amount).toLocaleString()}`;
      }
    },
    { key: 'tag', title: 'Category' },
  ];

  if (!isOnline) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-md p-4 text-center">
        <p className="text-orange-800">Backend is offline. Please check your connection.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4 text-center">
        <p className="text-red-800">{error}</p>
        <button
          onClick={() => { void fetchCreditData(); }}
          className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="credit-dashboard-page-title">Credit Card Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track your credit card spending, balances, and payments.
          </p>
        </div>
        <button
          onClick={() => navigate('/admin')}
          className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded hover:bg-gray-50 text-sm font-medium"
        >
          Manage Cards
        </button>
      </div>

      {/* Credit Summary Cards */}
      <CreditCardSummary creditCards={creditCards} />

      {/* Credit Card Details */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Credit Card Details</h2>

          {creditCards.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500 mb-4">No credit card accounts found.</div>
              <button
                onClick={() => navigate('/admin')}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Add Credit Card
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {creditCards.map(card => (
                <div key={card.id} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2">{card.name}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Balance:</span>
                      <span className="font-medium">${card.outstandingBalance.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Available:</span>
                      <span className="font-medium text-green-600">${card.availableCredit.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Min Payment:</span>
                      <span className="font-medium">${card.minimumPayment.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Due Date:</span>
                      <span className="font-medium">{card.dueDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">APR:</span>
                      <span className="font-medium">{(card.apr * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Credit Transactions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Credit Transactions</h2>
          <DataTable
            data={creditTransactions}
            columns={transactionColumns}
            loading={loading}
            emptyMessage="No credit transactions found"
            filterable={true}
            sortable={true}
            pagination={true}
          />
        </div>
      </div>
    </div>
  );
};

export default CreditDashboardPage;