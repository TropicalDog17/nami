import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';

interface SmartActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (transactionData: any) => void;
  initialType?: 'expense' | 'income' | 'transfer' | 'repay_borrow';
}

// Quick amount buttons for different transaction types
const EXPENSE_AMOUNTS = [5, 10, 20, 50, 100, 200];
const INCOME_AMOUNTS = [100, 500, 1000, 2000, 5000];
const TRANSFER_AMOUNTS = [50, 100, 250, 500, 1000];

// Common categories with icons for different transaction types
const EXPENSE_CATEGORIES = [
  { name: 'Food', icon: '🍔', color: 'orange' },
  { name: 'Transport', icon: '🚗', color: 'blue' },
  { name: 'Shopping', icon: '🛍️', color: 'purple' },
  { name: 'Entertainment', icon: '🎮', color: 'pink' },
  { name: 'Bills', icon: '📄', color: 'green' },
  { name: 'Healthcare', icon: '💊', color: 'red' },
  { name: 'Coffee', icon: '☕', color: 'brown' },
  { name: 'Gas', icon: '⛽', color: 'gray' },
];

const INCOME_CATEGORIES = [
  { name: 'Salary', icon: '💰', color: 'green' },
  { name: 'Freelance', icon: '💻', color: 'blue' },
  { name: 'Investment', icon: '📈', color: 'purple' },
  { name: 'Business', icon: '💼', color: 'orange' },
  { name: 'Gift', icon: '🎁', color: 'pink' },
  { name: 'Other', icon: '💵', color: 'gray' },
];

const SmartActionModal: React.FC<SmartActionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialType = 'expense'
}) => {
  const { accounts, assets, tags, actions, transactions } = useApp();
  const today = new Date().toISOString().split('T')[0];
  const amountInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    date: today,
    type: initialType,
    amount: '',
    category: '',
    note: '',
    account: '',
    toAccount: '', // For transfers
    asset: 'USD',
    quantity: '1',
    price_local: '1',
    counterparty: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedAccount, setSuggestedAccount] = useState<string>('');
  const [suggestedToAccount, setSuggestedToAccount] = useState<string>('');
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

  // Get appropriate amounts and categories based on transaction type
  const getQuickAmounts = () => {
    switch (formData.type) {
      case 'income': return INCOME_AMOUNTS;
      case 'transfer': return TRANSFER_AMOUNTS;
      default: return EXPENSE_AMOUNTS;
    }
  };

  const getCategories = () => {
    switch (formData.type) {
      case 'income': return INCOME_CATEGORIES;
      default: return EXPENSE_CATEGORIES;
    }
  };

  // Smart defaults based on user behavior
  useEffect(() => {
    if (!isOpen) return;

    // Reset form with new type
    setFormData(prev => ({
      ...prev,
      type: initialType,
      amount: '',
      category: '',
      note: '',
      account: suggestedAccount || '',
      toAccount: '',
      counterparty: ''
    }));

    // Get recent transactions of the same type to learn user patterns
    const recent = transactions?.slice(0, 20).filter(t => t.type === formData.type) || [];
    setRecentTransactions(recent);

    if (recent.length > 0) {
      // Find most frequently used account for this transaction type
      const accountFrequency: { [key: string]: number } = {};
      recent.forEach(tx => {
        accountFrequency[tx.account] = (accountFrequency[tx.account] || 0) + 1;
      });

      const mostUsedAccount = Object.entries(accountFrequency)
        .sort(([,a], [,b]) => b - a)[0]?.[0];

      if (mostUsedAccount && accounts?.some(acc => acc.name === mostUsedAccount)) {
        setSuggestedAccount(mostUsedAccount);
        setFormData(prev => ({ ...prev, account: mostUsedAccount }));
      }

      // For transfers, find most frequently used "to" account
      if (formData.type === 'transfer') {
        const toAccountFrequency: { [key: string]: number } = {};
        recent.forEach(tx => {
          if (tx.to_account) {
            toAccountFrequency[tx.to_account] = (toAccountFrequency[tx.to_account] || 0) + 1;
          }
        });

        const mostUsedToAccount = Object.entries(toAccountFrequency)
          .sort(([,a], [,b]) => b - a)[0]?.[0];

        if (mostUsedToAccount && accounts?.some(acc => acc.name === mostUsedToAccount)) {
          setSuggestedToAccount(mostUsedToAccount);
          setFormData(prev => ({ ...prev, toAccount: mostUsedToAccount }));
        }
      }

      // Find most frequently used category
      const categoryFrequency: { [key: string]: number } = {};
      recent.forEach(tx => {
        if (tx.tag) {
          categoryFrequency[tx.tag] = (categoryFrequency[tx.tag] || 0) + 1;
        }
      });

      const mostUsedCategory = Object.entries(categoryFrequency)
        .sort(([,a], [,b]) => b - a)[0]?.[0];

      if (mostUsedCategory && tags?.some(tag => tag.name === mostUsedCategory)) {
        setFormData(prev => ({ ...prev, category: mostUsedCategory }));
      }
    }
  }, [isOpen, formData.type, transactions, accounts, tags, initialType]);

  // Auto-focus amount input when modal opens
  useEffect(() => {
    if (isOpen && amountInputRef.current) {
      setTimeout(() => amountInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      let transactionData: any = {
        date: formData.date,
        type: formData.type,
        quantity: formData.quantity || '1',
        price_local: formData.price_local || formData.amount,
        amount_local: formData.amount,
        asset: formData.asset,
        account: formData.account || suggestedAccount || 'Default',
        tag: formData.category,
        note: formData.note,
        counterparty: formData.counterparty,
        fx_to_usd: '1.0',
        fx_to_vnd: '24000.0',
        amount_usd: formData.amount,
        amount_vnd: (parseFloat(formData.amount || '0') * 24000).toFixed(2),
        fee_usd: '0',
        fee_vnd: '0'
      };

      // Add transfer-specific fields
      if (formData.type === 'transfer' && formData.toAccount) {
        transactionData.to_account = formData.toAccount;
      }

      await onSubmit(transactionData);
      onClose();
    } catch (error) {
      console.error('Error submitting transaction:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleQuickAmount = (amount: number) => {
    setFormData(prev => ({ ...prev, amount: amount.toString() }));
    setTimeout(() => {
      const noteInput = document.querySelector('input[placeholder*="note"], input[placeholder*="description"]') as HTMLInputElement;
      if (noteInput) noteInput.focus();
    }, 100);
  };

  const handleQuickCategory = (category: string) => {
    setFormData(prev => ({ ...prev, category }));
    const categoryNote = generateNoteFromCategory(category, formData.type);
    setFormData(prev => ({ ...prev, note: categoryNote }));
  };

  const generateNoteFromCategory = (category: string, type: string): string => {
    const suggestions: { [key: string]: { [key: string]: string[] } } = {
      expense: {
        'Food': ['Lunch', 'Dinner', 'Groceries', 'Snack', 'Coffee'],
        'Transport': ['Gas', 'Uber', 'Bus fare', 'Parking', 'Maintenance'],
        'Shopping': ['Clothes', 'Electronics', 'Household items'],
        'Entertainment': ['Movie', 'Gaming', 'Subscription'],
        'Bills': ['Electricity', 'Internet', 'Phone', 'Rent'],
        'Healthcare': ['Medicine', 'Doctor visit', 'Insurance'],
        'Coffee': ['Morning coffee', 'Afternoon pick-me-up'],
        'Gas': ['Fuel tank', 'Car maintenance']
      },
      income: {
        'Salary': ['Monthly salary', 'Bi-weekly pay'],
        'Freelance': ['Project payment', 'Consulting work'],
        'Investment': ['Dividend payment', 'Capital gains'],
        'Business': ['Business revenue', 'Client payment'],
        'Gift': ['Birthday gift', 'Holiday gift']
      }
    };

    const typeSuggestions = suggestions[type] || suggestions.expense;
    const categorySuggestions = typeSuggestions[category] || [];
    return categorySuggestions[Math.floor(Math.random() * categorySuggestions.length)] || '';
  };

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  }, [onClose, formData]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  // Get available categories with icons
  const categories = getCategories();
  const availableCategories = categories.filter(cat =>
    !tags?.length || tags?.some(tag => tag.name === cat.name && tag.is_active)
  );

  const quickAmounts = getQuickAmounts();
  const isTransfer = formData.type === 'transfer';
  const isIncome = formData.type === 'income';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              {isIncome ? 'Add Income' : isTransfer ? 'Transfer Money' : 'Quick Expense'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {suggestedAccount && `Using: ${suggestedAccount}`}
              {isTransfer && suggestedToAccount && ` → ${suggestedToAccount}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Transaction Type Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {['expense', 'income', 'transfer', 'repay_borrow'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleInputChange('type', type)}
                  className={`px-3 py-2 rounded-lg font-medium transition-all capitalize ${
                    formData.type === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Amount Buttons */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Quick Amount
            </label>
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts.map(amount => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => handleQuickAmount(amount)}
                  className={`px-3 py-2 rounded-lg font-medium transition-all ${
                    formData.amount === amount.toString()
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ${amount}
                </button>
              ))}
              <input
                ref={amountInputRef}
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                className="col-span-4 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                placeholder="Custom amount"
                autoFocus
                required
              />
            </div>
          </div>

          {/* Quick Category Selection (not for transfers) */}
          {!isTransfer && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Category
              </label>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {availableCategories.map(category => (
                  <button
                    key={category.name}
                    type="button"
                    onClick={() => handleQuickCategory(category.name)}
                    className={`px-3 py-3 rounded-lg text-center transition-all ${
                      formData.category === category.name
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <div className="text-2xl mb-1">{category.icon}</div>
                    <div className="text-xs font-medium">{category.name}</div>
                  </button>
                ))}
              </div>

              {/* All Categories Dropdown */}
              <select
                value={formData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select category...</option>
                {tags?.filter(t => t.is_active).map(tag => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Account Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isTransfer ? 'From Account' : 'Account'}
            </label>
            <select
              value={formData.account}
              onChange={(e) => handleInputChange('account', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select account...</option>
              {accounts?.map(account => (
                <option key={account.name} value={account.name}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          {/* To Account (for transfers) */}
          {isTransfer && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To Account
              </label>
              <select
                value={formData.toAccount}
                onChange={(e) => handleInputChange('toAccount', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select destination account...</option>
                {accounts?.filter(acc => acc.name !== formData.account).map(account => (
                  <option key={account.name} value={account.name}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Counterparty */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isIncome ? 'Source' : isTransfer ? 'Description' : 'Merchant'}
            </label>
            <input
              type="text"
              value={formData.counterparty}
              onChange={(e) => handleInputChange('counterparty', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={isIncome ? 'Income source...' : isTransfer ? 'Transfer description...' : 'Where did you spend this?'}
            />
          </div>

          {/* Note Field with Smart Suggestions */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note (optional)
            </label>
            <input
              type="text"
              value={formData.note}
              onChange={(e) => handleInputChange('note', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={isIncome ? "What's this income for?" : isTransfer ? "Transfer notes..." : "What was this expense for?"}
            />

            {/* Recent transaction suggestions */}
            {recentTransactions.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-2">Recent:</p>
                <div className="flex flex-wrap gap-1">
                  {recentTransactions.slice(0, 5).map((tx, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          note: tx.note || `${tx.tag} ${tx.type}`
                        }));
                      }}
                      className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      {tx.note?.slice(0, 15) || tx.tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.amount || (!isTransfer && !formData.category) || (isTransfer && !formData.toAccount)}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {isSubmitting ? 'Saving...' : (isIncome ? 'Add Income' : isTransfer ? 'Transfer' : 'Save Expense')}
            </button>
          </div>

          {/* Keyboard Shortcuts Hint */}
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-400">
              Press <kbd>Ctrl+Enter</kbd> to save • <kbd>Esc</kbd> to cancel
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SmartActionModal;