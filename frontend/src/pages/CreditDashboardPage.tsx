import React, { useState, useEffect } from 'react';
import { useBackendStatus } from '../context/BackendStatusContext';
import { reportsApi, transactionsApi } from '../services/api';
import CreditCardSummary from '../components/CreditCardSummary';
import DataTable from '../components/ui/DataTable';

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
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [creditTransactions, setCreditTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isOnline } = useBackendStatus();

  useEffect(() => {
    if (isOnline) {
      fetchCreditData();
    }
  }, [isOnline]);

  const fetchCreditData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch credit transactions (expenses and repay_borrow)
      const [expensesResponse, repayResponse] = await Promise.all([
        transactionsApi.list({ type: 'expense', limit: 100 }),
        transactionsApi.list({ type: 'repay_borrow', limit: 100 })
      ]);

      // Process transactions to group by credit card account
      const creditAccounts = processCreditAccounts(expensesResponse, repayResponse);
      setCreditCards(creditAccounts);

      // Combine recent credit transactions
      const allCreditTransactions = [
        ...expensesResponse,
        ...repayResponse
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);

      setCreditTransactions(allCreditTransactions);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch credit data');
    } finally {
      setLoading(false);
    }
  };

  const processCreditAccounts = (expenses: any[], repayments: any[]): CreditCard[] => {
    // Group transactions by account and calculate balances
    const accountBalances: { [key: string]: CreditCard } = {};

    // Process expenses (charges)
    expenses.forEach(expense => {
      const account = expense.account;
      if (!accountBalances[account]) {
        accountBalances[account] = {
          id: account,
          name: account,
          outstandingBalance: 0,
          availableCredit: 5000, // Default - should be configurable
          creditLimit: 5000,
          minimumPayment: 0,
          dueDate: getNextDueDate(),
          apr: 0.19 // Default APR
        };
      }
      accountBalances[account].outstandingBalance += parseFloat(expense.amount_usd || 0);
    });

    // Process repayments
    repayments.forEach(payment => {
      const account = payment.account;
      if (accountBalances[account]) {
        accountBalances[account].outstandingBalance -= parseFloat(payment.amount_usd || 0);
      }
    });

    // Calculate minimum payments (2% of balance or $25 minimum)
    Object.values(accountBalances).forEach(card => {
      card.minimumPayment = Math.max(card.outstandingBalance * 0.02, 25);
      card.availableCredit = card.creditLimit - card.outstandingBalance;
    });

    return Object.values(accountBalances);
  };

  const getNextDueDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 15); // Due in 15 days from today
    return date.toISOString().split('T')[0];
  };

  const transactionColumns = [
    { key: 'date', title: 'Date', render: (value: any) => new Date(value).toLocaleDateString() },
    { key: 'type', title: 'Type', render: (value: any) => value === 'expense' ? 'Charge' : 'Payment' },
    { key: 'account', title: 'Card' },
    { key: 'counterparty', title: 'Merchant' },
    {
      key: 'amount_usd',
      title: 'Amount',
      render: (value: any, row: any) => {
        const amount = parseFloat(value || 0);
        const sign = row.type === 'expense' ? '-' : '+';
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
          onClick={fetchCreditData}
          className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Credit Card Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track your credit card spending, balances, and payments.
        </p>
      </div>

      {/* Credit Summary Cards */}
      <CreditCardSummary creditCards={creditCards} />

      {/* Credit Card Details */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Credit Card Details</h2>

          {creditCards.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No credit card activity found. Start by adding credit expenses.
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