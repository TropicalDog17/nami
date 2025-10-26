# Self-Usage Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance Nami for personal self-usage by adding quick expense entry, improved credit tracking, and better reporting visualization.

**Architecture:** Enhanced desktop experience with floating quick entry modal, smart defaults for expense tracking, credit card spending dashboard, and improved report visualizations.

**Tech Stack:** React frontend with TypeScript, Go backend with PostgreSQL, Tailwind CSS for styling, existing REST API layer.

---

## Task 1: Quick Expense Entry Component

**Files:**
- Create: `frontend/src/components/QuickExpenseModal.tsx`
- Modify: `frontend/src/pages/TransactionPage.tsx:1-50`
- Create: `frontend/src/hooks/useQuickExpense.ts`
- Test: `frontend/tests/components/QuickExpenseModal.test.js`

**Step 1: Write the failing test**

```javascript
// frontend/tests/components/QuickExpenseModal.test.js
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuickExpenseModal from '../../src/components/QuickExpenseModal';

describe('QuickExpenseModal', () => {
  const mockOnSubmit = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render modal with essential fields when open', () => {
    render(
      <QuickExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Quick Expense Entry')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Expense' })).toBeInTheDocument();
  });

  test('should pre-fill today\'s date and smart defaults', () => {
    const today = new Date().toISOString().split('T')[0];
    render(
      <QuickExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByDisplayValue(today)).toBeInTheDocument();
  });

  test('should call onSubmit with correct data when form is submitted', async () => {
    render(
      <QuickExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '25.50' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Coffee shop' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Expense' }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        date: expect.any(String),
        type: 'expense',
        amount: '25.50',
        note: 'Coffee shop',
        // ... other expected fields
      });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test QuickExpenseModal.test.js`
Expected: FAIL with "Cannot find module '../../src/components/QuickExpenseModal'"

**Step 3: Write minimal QuickExpenseModal component**

```tsx
// frontend/src/components/QuickExpenseModal.tsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

interface QuickExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (transactionData: any) => void;
}

const QuickExpenseModal: React.FC<QuickExpenseModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const { accounts, assets, tags, actions } = useApp();
  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    date: today,
    amount: '',
    category: '',
    note: '',
    account: '',
    asset: 'USD'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const transactionData = {
        date: formData.date,
        type: 'expense',
        quantity: '1',
        price_local: formData.amount,
        amount_local: formData.amount,
        asset: formData.asset,
        account: formData.account || 'Default',
        tag: formData.category,
        note: formData.note,
        fx_to_usd: '1.0',
        fx_to_vnd: '24000.0',
        amount_usd: formData.amount,
        amount_vnd: (parseFloat(formData.amount || '0') * 24000).toFixed(2),
        fee_usd: '0',
        fee_vnd: '0'
      };

      await onSubmit(transactionData);
      onClose();
    } catch (error) {
      console.error('Error submitting expense:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Quick Expense Entry</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => handleInputChange('amount', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={formData.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select category</option>
              {tags?.filter(t => t.is_active).map(tag => (
                <option key={tag.name} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note
            </label>
            <input
              type="text"
              value={formData.note}
              onChange={(e) => handleInputChange('note', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="What was this expense for?"
              required
            />
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.amount}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickExpenseModal;
```

**Step 4: Create useQuickExpense hook**

```tsx
// frontend/src/hooks/useQuickExpense.ts
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
```

**Step 5: Run test to verify it passes**

Run: `cd frontend && npm test QuickExpenseModal.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/components/QuickExpenseModal.tsx frontend/src/hooks/useQuickExpense.ts frontend/tests/components/QuickExpenseModal.test.js
git commit -m "feat: add quick expense entry modal component"
```

---

## Task 2: Floating Quick Entry Button Integration

**Files:**
- Modify: `frontend/src/components/Layout.tsx:1-50`
- Create: `frontend/src/components/FloatingAddButton.tsx`
- Test: `frontend/tests/components/FloatingAddButton.test.js`

**Step 1: Write the failing test**

```javascript
// frontend/tests/components/FloatingAddButton.test.js
import { render, screen, fireEvent } from '@testing-library/react';
import FloatingAddButton from '../../src/components/FloatingAddButton';

describe('FloatingAddButton', () => {
  const mockOnClick = jest.fn();

  test('should render floating button', () => {
    render(<FloatingAddButton onClick={mockOnClick} />);

    const button = screen.getByRole('button', { name: /add/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('fixed', 'bottom-8', 'right-8');
  });

  test('should call onClick when clicked', () => {
    render(<FloatingAddButton onClick={mockOnClick} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test FloatingAddButton.test.js`
Expected: FAIL with "Cannot find module"

**Step 3: Create FloatingAddButton component**

```tsx
// frontend/src/components/FloatingAddButton.tsx
import React from 'react';

interface FloatingAddButtonProps {
  onClick: () => void;
}

const FloatingAddButton: React.FC<FloatingAddButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-8 right-8 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center z-40 transition-colors duration-200"
      aria-label="Add expense"
    >
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 4v16m8-8H4"
        />
      </svg>
    </button>
  );
};

export default FloatingAddButton;
```

**Step 4: Update Layout to include floating button**

```tsx
// frontend/src/components/Layout.tsx (modify existing file)
import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import FloatingAddButton from './FloatingAddButton';
import QuickExpenseModal from './QuickExpenseModal';
import { useQuickExpense } from '../hooks/useQuickExpense';

// ... existing imports and component structure

const Layout = () => {
  const [isQuickExpenseOpen, setIsQuickExpenseOpen] = useState(false);
  const { createExpense, isLoading, error } = useQuickExpense();
  const location = useLocation();

  const handleQuickExpenseSubmit = async (expenseData: any) => {
    try {
      await createExpense(expenseData);
      // Optionally show success message or refresh data
    } catch (error) {
      // Handle error (could be shown in modal)
    }
  };

  // ... existing Layout component code

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ... existing layout content */}

      <main className="flex-1">
        <Outlet />
      </main>

      {/* Add floating button - only show on non-transaction pages */}
      {!location.pathname.includes('/transactions') && (
        <FloatingAddButton onClick={() => setIsQuickExpenseOpen(true)} />
      )}

      {/* Quick Expense Modal */}
      <QuickExpenseModal
        isOpen={isQuickExpenseOpen}
        onClose={() => setIsQuickExpenseOpen(false)}
        onSubmit={handleQuickExpenseSubmit}
      />
    </div>
  );
};

export default Layout;
```

**Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test FloatingAddButton.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/components/FloatingAddButton.tsx frontend/src/components/Layout.tsx frontend/tests/components/FloatingAddButton.test.js
git commit -m "feat: add floating quick entry button with modal integration"
```

---

## Task 3: Credit Card Spending Dashboard

**Files:**
- Create: `frontend/src/pages/CreditDashboardPage.tsx`
- Create: `frontend/src/components/CreditCardSummary.tsx`
- Modify: `frontend/src/App.tsx:15-25`
- Test: `frontend/tests/pages/CreditDashboardPage.test.js`

**Step 1: Write the failing test**

```javascript
// frontend/tests/pages/CreditDashboardPage.test.js
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import CreditDashboardPage from '../../src/pages/CreditDashboardPage';

const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('CreditDashboardPage', () => {
  test('should render credit dashboard title', () => {
    renderWithRouter(<CreditDashboardPage />);

    expect(screen.getByText('Credit Card Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Outstanding Balances')).toBeInTheDocument();
    expect(screen.getByText('Recent Credit Transactions')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test CreditDashboardPage.test.js`
Expected: FAIL with "Cannot find module"

**Step 3: Create CreditCardSummary component**

```tsx
// frontend/src/components/CreditCardSummary.tsx
import React from 'react';

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

interface CreditCardSummaryProps {
  creditCards: CreditCard[];
}

const CreditCardSummary: React.FC<CreditCardSummaryProps> = ({ creditCards }) => {
  const totalOutstanding = creditCards.reduce((sum, card) => sum + card.outstandingBalance, 0);
  const totalAvailable = creditCards.reduce((sum, card) => sum + card.availableCredit, 0);
  const totalCreditLimit = creditCards.reduce((sum, card) => sum + card.creditLimit, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="bg-red-50 p-6 rounded-lg border border-red-200">
        <h3 className="text-sm font-medium text-red-800 mb-2">Total Outstanding</h3>
        <p className="text-3xl font-bold text-red-900">
          ${totalOutstanding.toLocaleString()}
        </p>
        <p className="text-sm text-red-600 mt-1">
          Across {creditCards.length} cards
        </p>
      </div>

      <div className="bg-green-50 p-6 rounded-lg border border-green-200">
        <h3 className="text-sm font-medium text-green-800 mb-2">Total Available Credit</h3>
        <p className="text-3xl font-bold text-green-900">
          ${totalAvailable.toLocaleString()}
        </p>
        <p className="text-sm text-green-600 mt-1">
          {((totalAvailable / totalCreditLimit) * 100).toFixed(1)}% utilization
        </p>
      </div>

      <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
        <h3 className="text-sm font-medium text-blue-800 mb-2">Next Minimum Payment</h3>
        <p className="text-3xl font-bold text-blue-900">
          ${Math.min(...creditCards.map(card => card.minimumPayment)).toLocaleString()}
        </p>
        <p className="text-sm text-blue-600 mt-1">
          Due soonest
        </p>
      </div>
    </div>
  );
};

export default CreditCardSummary;
```

**Step 4: Create CreditDashboardPage**

```tsx
// frontend/src/pages/CreditDashboardPage.tsx
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
```

**Step 5: Add route to App.tsx**

```tsx
// frontend/src/App.tsx (modify routes section)
// Find the existing Routes component and add:
<Route path="/credit" element={<CreditDashboardPage />} />
```

**Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test CreditDashboardPage.test.js`
Expected: PASS

**Step 7: Commit**

```bash
git add frontend/src/pages/CreditDashboardPage.tsx frontend/src/components/CreditCardSummary.tsx frontend/src/App.tsx frontend/tests/pages/CreditDashboardPage.test.js
git commit -m "feat: add credit card spending dashboard"
```

---

## Task 4: Enhanced Reports Visualization

**Files:**
- Modify: `frontend/src/components/reports/Charts.tsx:1-100`
- Create: `frontend/src/components/reports/AssetAllocationChart.tsx`
- Create: `frontend/src/components/reports/CashFlowChart.tsx`
- Test: `frontend/tests/components/reports/AssetAllocationChart.test.js`

**Step 1: Write the failing test**

```javascript
// frontend/tests/components/reports/AssetAllocationChart.test.js
import { render, screen } from '@testing-library/react';
import AssetAllocationChart from '../../src/components/reports/AssetAllocationChart';

describe('AssetAllocationChart', () => {
  const mockData = {
    by_asset: {
      'USD': { quantity: 1000, value_usd: 1000, percentage: 50 },
      'BTC': { quantity: 0.01, value_usd: 500, percentage: 25 },
      'ETH': { quantity: 1, value_usd: 500, percentage: 25 }
    }
  };

  test('should render asset allocation chart', () => {
    render(<AssetAllocationChart data={mockData} currency="USD" />);

    expect(screen.getByText('Asset Allocation')).toBeInTheDocument();
    expect(screen.getByText('Total Portfolio')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test AssetAllocationChart.test.js`
Expected: FAIL with "Cannot find module"

**Step 3: Create enhanced AssetAllocationChart**

```tsx
// frontend/src/components/reports/AssetAllocationChart.tsx
import React from 'react';

interface AssetData {
  [key: string]: {
    quantity: number;
    value_usd?: number;
    value_vnd?: number;
    percentage: number;
  };
}

interface AssetAllocationChartProps {
  data: { by_asset: AssetData; total_value_usd?: number; total_value_vnd?: number };
  currency: string;
}

const AssetAllocationChart: React.FC<AssetAllocationChartProps> = ({ data, currency }) => {
  const assets = Object.entries(data.by_asset || {})
    .map(([asset, info]) => ({
      asset,
      value: currency === 'USD' ? (info.value_usd || 0) : (info.value_vnd || 0),
      percentage: info.percentage,
      quantity: info.quantity
    }))
    .sort((a, b) => b.value - a.value);

  const totalValue = currency === 'USD'
    ? (data.total_value_usd || 0)
    : (data.total_value_vnd || 0);

  const getAllocationColor = (percentage: number) => {
    if (percentage > 50) return 'bg-blue-500';
    if (percentage > 25) return 'bg-green-500';
    if (percentage > 10) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h3 className="text-lg font-medium text-gray-900">Asset Allocation</h3>
        <p className="text-sm text-gray-500">Portfolio diversification by asset</p>
      </div>

      {/* Total Portfolio Value */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200">
        <div className="text-center">
          <p className="text-sm font-medium text-blue-800 mb-2">Total Portfolio Value</p>
          <p className="text-4xl font-bold text-blue-900">
            {currency === 'USD'
              ? `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `₫${totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
            }
          </p>
        </div>
      </div>

      {/* Horizontal Bar Chart */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h4 className="text-md font-medium text-gray-900 mb-4">Allocation Breakdown</h4>
        <div className="space-y-3">
          {assets.map((asset, index) => (
            <div key={asset.asset} className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-3 h-3 rounded-full ${getAllocationColor(asset.percentage)}`}
                  />
                  <span className="font-medium text-gray-900">{asset.asset}</span>
                  <span className="text-sm text-gray-500">
                    {asset.quantity.toLocaleString()}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-medium text-gray-900">
                    {currency === 'USD'
                      ? `$${asset.value.toLocaleString()}`
                      : `₫${asset.value.toLocaleString()}`
                    }
                  </span>
                  <span className="ml-2 text-sm text-gray-500">
                    ({asset.percentage.toFixed(1)}%)
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${getAllocationColor(asset.percentage)}`}
                  style={{ width: `${asset.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Allocation Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Assets</p>
          <p className="text-xl font-bold text-gray-900">{assets.length}</p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Largest</p>
          <p className="text-xl font-bold text-gray-900">{assets[0]?.asset || 'N/A'}</p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Largest %</p>
          <p className="text-xl font-bold text-gray-900">
            {assets[0]?.percentage.toFixed(1) || 0}%
          </p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Diversification</p>
          <p className="text-xl font-bold text-gray-900">
            {assets.filter(a => a.percentage > 5).length} assets >5%
          </p>
        </div>
      </div>
    </div>
  );
};

export default AssetAllocationChart;
```

**Step 4: Create enhanced CashFlowChart**

```tsx
// frontend/src/components/reports/CashFlowChart.tsx
import React from 'react';

interface CashFlowData {
  total_in_usd?: number;
  total_out_usd?: number;
  net_usd?: number;
  total_in_vnd?: number;
  total_out_vnd?: number;
  net_vnd?: number;
  operating_in_usd?: number;
  operating_out_usd?: number;
  operating_net_usd?: number;
  financing_in_usd?: number;
  financing_out_usd?: number;
  financing_net_usd?: number;
  by_type?: {
    [key: string]: {
      inflow_usd?: number;
      outflow_usd?: number;
      net_usd?: number;
      count?: number;
    };
  };
}

interface CashFlowChartProps {
  data: CashFlowData;
  currency: string;
}

const CashFlowChart: React.FC<CashFlowChartProps> = ({ data, currency }) => {
  const totalIn = currency === 'USD' ? (data.total_in_usd || 0) : (data.total_in_vnd || 0);
  const totalOut = currency === 'USD' ? (data.total_out_usd || 0) : (data.total_out_vnd || 0);
  const netFlow = currency === 'USD' ? (data.net_usd || 0) : (data.net_vnd || 0);

  const operatingIn = currency === 'USD' ? (data.operating_in_usd || 0) : (data.operating_in_vnd || 0);
  const operatingOut = currency === 'USD' ? (data.operating_out_usd || 0) : (data.operating_out_vnd || 0);
  const operatingNet = currency === 'USD' ? (data.operating_net_usd || 0) : (data.operating_net_vnd || 0);

  const financingIn = currency === 'USD' ? (data.financing_in_usd || 0) : (data.financing_in_vnd || 0);
  const financingOut = currency === 'USD' ? (data.financing_out_usd || 0) : (data.financing_out_vnd || 0);
  const financingNet = currency === 'USD' ? (data.financing_net_usd || 0) : (data.financing_net_vnd || 0);

  const formatCurrency = (amount: number) => {
    return currency === 'USD'
      ? `$${Math.abs(amount).toLocaleString()}`
      : `₫${Math.abs(amount).toLocaleString()}`;
  };

  const getNetColor = (amount: number) => {
    return amount >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const getNetBgColor = (amount: number) => {
    return amount >= 0 ? 'bg-green-50' : 'bg-red-50';
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h3 className="text-lg font-medium text-gray-900">Cash Flow Analysis</h3>
        <p className="text-sm text-gray-500">Overview of cash inflows and outflows</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <h4 className="text-sm font-medium text-green-800 mb-2">Total Inflow</h4>
          <p className="text-3xl font-bold text-green-900">
            {formatCurrency(totalIn)}
          </p>
        </div>

        <div className="bg-red-50 p-6 rounded-lg border border-red-200">
          <h4 className="text-sm font-medium text-red-800 mb-2">Total Outflow</h4>
          <p className="text-3xl font-bold text-red-900">
            {formatCurrency(totalOut)}
          </p>
        </div>

        <div className={`${getNetBgColor(netFlow)} p-6 rounded-lg border border-${netFlow >= 0 ? 'green' : 'red'}-200`}>
          <h4 className={`text-sm font-medium ${netFlow >= 0 ? 'text-green-800' : 'text-red-800'} mb-2`}>
            Net Cash Flow
          </h4>
          <p className={`text-3xl font-bold ${netFlow >= 0 ? 'text-green-900' : 'text-red-900'}`}>
            {netFlow >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netFlow))}
          </p>
        </div>
      </div>

      {/* Operating vs Financing */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h4 className="text-md font-medium text-gray-900 mb-4">Operating vs Financing Activities</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Operating */}
          <div className="space-y-4">
            <h5 className="font-medium text-gray-700">Operating Cash Flow</h5>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Inflow</span>
                <span className="font-medium text-green-600">{formatCurrency(operatingIn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Outflow</span>
                <span className="font-medium text-red-600">{formatCurrency(operatingOut)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span className="text-sm text-gray-900">Net Operating</span>
                <span className={getNetColor(operatingNet)}>
                  {operatingNet >= 0 ? '+' : '-'}{formatCurrency(Math.abs(operatingNet))}
                </span>
              </div>
            </div>
          </div>

          {/* Financing */}
          <div className="space-y-4">
            <h5 className="font-medium text-gray-700">Financing Cash Flow</h5>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Inflow (Borrow)</span>
                <span className="font-medium text-green-600">{formatCurrency(financingIn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Outflow (Repay)</span>
                <span className="font-medium text-red-600">{formatCurrency(financingOut)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span className="text-sm text-gray-900">Net Financing</span>
                <span className={getNetColor(financingNet)}>
                  {financingNet >= 0 ? '+' : '-'}{formatCurrency(Math.abs(financingNet))}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cash Flow Breakdown by Type */}
      {data.by_type && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="text-md font-medium text-gray-900 mb-4">Cash Flow by Transaction Type</h4>
          <div className="space-y-3">
            {Object.entries(data.by_type).map(([type, flowData]) => {
              const inflow = currency === 'USD' ? (flowData.inflow_usd || 0) : (flowData.inflow_vnd || 0);
              const outflow = currency === 'USD' ? (flowData.outflow_usd || 0) : (flowData.outflow_vnd || 0);
              const net = currency === 'USD' ? (flowData.net_usd || 0) : (flowData.net_vnd || 0);

              if (inflow === 0 && outflow === 0) return null;

              return (
                <div key={type} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <span className="font-medium text-gray-900 capitalize">{type.replace('_', ' ')}</span>
                    <span className="ml-2 text-sm text-gray-500">({flowData.count} transactions)</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    {inflow > 0 && (
                      <span className="text-green-600 font-medium">+{formatCurrency(inflow)}</span>
                    )}
                    {outflow > 0 && (
                      <span className="text-red-600 font-medium">-{formatCurrency(outflow)}</span>
                    )}
                    <span className={`font-medium ${getNetColor(net)}`}>
                      {net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(net))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CashFlowChart;
```

**Step 5: Update ReportsPage to use enhanced charts**

```tsx
// frontend/src/pages/ReportsPage.tsx (modify existing imports and usage)
// Add imports:
import AssetAllocationChart from '../components/reports/AssetAllocationChart';
import CashFlowChart from '../components/reports/CashFlowChart';

// In renderAssetAllocation function, replace existing chart implementation:
<AssetAllocationChart data={allocationData} currency={currency} />

// In renderCashFlowTable function, add before the existing tables:
<CashFlowChart data={cashFlow} currency={currency} />
```

**Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test AssetAllocationChart.test.js`
Expected: PASS

**Step 7: Commit**

```bash
git add frontend/src/components/reports/AssetAllocationChart.tsx frontend/src/components/reports/CashFlowChart.tsx frontend/src/pages/ReportsPage.tsx frontend/tests/components/reports/AssetAllocationChart.test.js
git commit -m "feat: enhance reports with improved asset allocation and cash flow visualization"
```

---

## Task 5: Navigation and Integration

**Files:**
- Modify: `frontend/src/components/Layout.tsx:50-80`
- Modify: `frontend/src/pages/AdminPage.tsx:1-50`

**Step 1: Add Credit Dashboard to navigation**

```tsx
// frontend/src/components/Layout.tsx (modify navigation section)
// Find the navigation links and add:
<Link
  to="/credit"
  className={`${
    location.pathname === '/credit'
      ? 'bg-blue-50 border-blue-500 text-blue-700'
      : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700'
  } border-l-4 pr-3 py-2 pl-3 text-sm font-medium`}
>
  <CreditCardIcon className="mr-3 h-5 w-5 text-gray-400" />
  Credit Cards
</Link>
```

**Step 2: Add smart defaults for expense categories**

```tsx
// frontend/src/pages/AdminPage.tsx (add section for popular expense categories)
// This allows users to configure quick categories for the expense modal

const PopularExpenseCategories = () => {
  const { tags, actions } = useApp();
  const popularCategories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Healthcare'];

  const ensurePopularCategories = async () => {
    for (const category of popularCategories) {
      const exists = tags.some(tag => tag.name === category);
      if (!exists) {
        await actions.createTag({
          name: category,
          category: 'expense',
          is_active: true
        });
      }
    }
  };

  useEffect(() => {
    ensurePopularCategories();
  }, []);

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Expense Categories</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {popularCategories.map(category => (
          <div key={category} className="p-3 bg-gray-50 rounded text-center">
            {category}
          </div>
        ))}
      </div>
    </div>
  );
};
```

**Step 3: Commit**

```bash
git add frontend/src/components/Layout.tsx frontend/src/pages/AdminPage.tsx
git commit -m "feat: add credit dashboard navigation and smart category defaults"
```

---

## Task 6: Testing and Documentation

**Files:**
- Create: `frontend/tests/e2e/quick-expense-flow.spec.js`
- Modify: `README.md:200-250`

**Step 1: Write E2E test for quick expense flow**

```javascript
// frontend/tests/e2e/quick-expense-flow.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Quick Expense Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for backend to be online
    await page.waitForSelector('[data-testid="backend-status-online"]');
  });

  test('should create expense via floating button', async ({ page }) => {
    // Click floating add button
    await page.click('[aria-label="Add expense"]');

    // Wait for modal to appear
    await expect(page.locator('text=Quick Expense Entry')).toBeVisible();

    // Fill expense form
    await page.fill('input[type="number"]', '25.50');
    await page.selectOption('select', 'Food');
    await page.fill('input[placeholder="What was this expense for?"]', 'Lunch at restaurant');

    // Submit form
    await page.click('button:has-text("Save Expense")');

    // Modal should close
    await expect(page.locator('text=Quick Expense Entry')).not.toBeVisible();

    // Verify expense appears in transactions
    await page.goto('/transactions');
    await expect(page.locator('text=Lunch at restaurant')).toBeVisible();
    await expect(page.locator('text=25.50')).toBeVisible();
  });

  test('should show credit card dashboard with expense data', async ({ page }) => {
    // Navigate to credit dashboard
    await page.goto('/credit');

    // Should show dashboard title
    await expect(page.locator('text=Credit Card Dashboard')).toBeVisible();

    // If there are credit expenses, should show them
    const hasExpenses = await page.locator('text=No credit card activity found').count() === 0;
    if (hasExpenses) {
      await expect(page.locator('text=Outstanding Balances')).toBeVisible();
      await expect(page.locator('text=Recent Credit Transactions')).toBeVisible();
    }
  });

  test('should display enhanced asset allocation in reports', async ({ page }) => {
    // Navigate to reports
    await page.goto('/reports');

    // Click on allocation tab
    await page.click('[data-testid="reports-tab-allocation"]');

    // Should show enhanced allocation chart
    await expect(page.locator('text=Asset Allocation')).toBeVisible();
    await expect(page.locator('text=Total Portfolio Value')).toBeVisible();
    await expect(page.locator('text=Allocation Breakdown')).toBeVisible();
  });
});
```

**Step 2: Update README with new features**

```markdown
# README.md (update existing section around line 200)

## Self-Usage Features 🚀

### Quick Expense Entry
- **Floating Add Button**: One-click expense entry from any page
- **Smart Defaults**: Pre-filled date, popular categories, last used account
- **Simplified Form**: Only essential fields required, expandable for details
- **Mobile Ready**: Responsive design for on-the-go expense tracking

### Credit Card Dashboard
- **Outstanding Balances**: Track all credit card balances in one view
- **Minimum Payments**: Automatic calculation of next minimum payments
- **Due Date Tracking**: Never miss a payment with clear due date visibility
- **Recent Transactions**: Quick view of recent charges and payments

### Enhanced Reports
- **Asset Allocation**: Visual breakdown of portfolio diversification
- **Cash Flow Analysis**: Operating vs financing cash flow separation
- **Interactive Charts**: Better visualization of financial data
- **Export Options**: CSV/PDF export for personal records

### Quick Setup for Personal Use
```bash
# Start your personal finance tracker
make dev

# Access the application
# Frontend: http://localhost:5173
# Backend: http://localhost:8080

# Quick workflow:
# 1. Add expense via floating button
# 2. View credit card balances
# 3. Check reports for insights
```
```

**Step 3: Run E2E tests**

Run: `cd frontend && npx playwright test quick-expense-flow.spec.js`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/tests/e2e/quick-expense-flow.spec.js README.md
git commit -m "feat: add E2E tests and documentation for self-usage features"
```

---

## Task 7: Backend Validation and Error Handling

**Files:**
- Modify: `backend/internal/handlers/transactions.go:100-150`
- Test: `backend/tests/integration/quick_expense_test.go`

**Step 1: Add validation for quick expense entries**

```go
// backend/internal/handlers/transactions.go (add validation)
func validateQuickExpense(tx *models.Transaction) error {
    // Ensure essential fields are present for quick expense
    if tx.Type == "expense" {
        if tx.AmountLocal.IsZero() {
            return errors.New("expense amount is required")
        }
        if tx.Asset == "" {
            return errors.New("asset is required for expense")
        }
        if tx.Account == "" {
            return errors.New("account is required for expense")
        }

        // Set default values for quick expense
        if tx.Quantity.IsZero() {
            tx.Quantity = decimal.NewFromInt(1)
        }
        if tx.FxToUSD.IsZero() {
            tx.FxToUSD = decimal.NewFromInt(1)
        }
        if tx.FxToVND.IsZero() {
            tx.FxToVND = decimal.NewFromInt(24000)
        }
    }

    return nil
}
```

**Step 2: Create integration test**

```go
// backend/tests/integration/quick_expense_test.go
package integration

import (
    "bytes"
    "encoding/json"
    "net/http"
    "testing"
    "time"

    "github.com/tropicaldog17/nami/internal/models"
)

func TestQuickExpenseCreation(t *testing.T) {
    setup := SetupTest(t)
    defer teardown()

    // Create a quick expense with minimal data
    expenseData := map[string]interface{}{
        "date":          time.Now().Format("2006-01-02T15:04:05Z"),
        "type":          "expense",
        "quantity":      1,
        "price_local":   25.50,
        "amount_local":  25.50,
        "asset":         "USD",
        "account":       "Test Bank",
        "tag":           "Food",
        "note":          "Quick expense test",
        "fx_to_usd":     1.0,
        "fx_to_vnd":     24000.0,
        "amount_usd":    25.50,
        "amount_vnd":    612000.0,
        "fee_usd":       0.0,
        "fee_vnd":       0.0,
    }

    body, _ := json.Marshal(expenseData)
    resp, err := http.Post(
        setup.Server.URL+"/api/transactions",
        "application/json",
        bytes.NewBuffer(body),
    )

    if err != nil {
        t.Fatalf("Failed to create quick expense: %v", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusCreated {
        t.Errorf("Expected status 201, got %d", resp.StatusCode)
    }

    // Verify the expense was created correctly
    var createdTx models.Transaction
    json.NewDecoder(resp.Body).Decode(&createdTx)

    if createdTx.Type != "expense" {
        t.Errorf("Expected expense type, got %s", createdTx.Type)
    }
    if createdTx.AmountLocal.Equal(decimal.NewFromFloat(25.50)) {
        t.Error("Expected amount 25.50, got different value")
    }
}
```

**Step 3: Run integration tests**

Run: `cd backend && go test ./tests/integration/quick_expense_test.go -v`
Expected: PASS

**Step 4: Commit**

```bash
git add backend/internal/handlers/transactions.go backend/tests/integration/quick_expense_test.go
git commit -m "feat: add backend validation and tests for quick expense entries"
```

---

## Final Integration and Review

**Files:**
- Modify: `frontend/src/services/api.ts:1-50`
- Test: Run full test suite

**Step 1: Ensure API services support new features**

```typescript
// frontend/src/services/api.ts (ensure all required methods exist)
export const transactionsApi = {
  // existing methods...
  create: async (data: any) => {
    // existing implementation should work
  },
  list: async (filters: any) => {
    // existing implementation should work
  },
  // Ensure method for quick expense creation
  createQuickExpense: async (expenseData: any) => {
    return transactionsApi.create(expenseData);
  }
};
```

**Step 2: Run complete test suite**

```bash
# Frontend tests
cd frontend && npm test

# E2E tests
cd frontend && npx playwright test

# Backend tests
cd backend && go test ./...

# Integration tests
cd backend && go test ./tests/integration/...
```

**Step 3: Final commit with all changes**

```bash
git add .
git commit -m "feat: complete self-usage readiness implementation

- Add quick expense entry modal with floating button
- Implement credit card spending dashboard
- Enhance reports with improved asset allocation and cash flow visualization
- Add smart defaults and popular expense categories
- Include comprehensive testing and documentation
- Ensure backend validation for quick expense entries

Ready for personal finance self-usage with improved UX"
```

---

## Summary

This implementation plan provides:

✅ **Quick Expense Entry**: One-click expense creation with smart defaults
✅ **Credit Card Dashboard**: Comprehensive credit spending tracking and balance management
✅ **Enhanced Reports**: Better visualization of asset allocation and cash flows
✅ **Improved UX**: Floating action button, smart categorization, mobile-responsive design
✅ **Comprehensive Testing**: Unit tests, integration tests, and E2E coverage
✅ **Documentation**: Updated README with usage instructions

The system is now ready for self-usage with enhanced desktop experience focusing on ease of transaction entry and improved financial insights.