import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';

interface QuickExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (transactionData: any) => void;
}

// Common expense amounts for quick selection
const QUICK_AMOUNTS = [5, 10, 20, 50, 100, 200];

// Common expense categories with icons/emojis for better UX
const COMMON_CATEGORIES = [
  { name: 'Food', icon: '🍔', color: 'orange' },
  { name: 'Transport', icon: '🚗', color: 'blue' },
  { name: 'Shopping', icon: '🛍️', color: 'purple' },
  { name: 'Entertainment', icon: '🎮', color: 'pink' },
  { name: 'Bills', icon: '📄', color: 'green' },
  { name: 'Healthcare', icon: '💊', color: 'red' },
  { name: 'Coffee', icon: '☕', color: 'brown' },
  { name: 'Gas', icon: '⛽', color: 'gray' },
];

const QuickExpenseModal: React.FC<QuickExpenseModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const { accounts, assets, tags, actions, transactions } = useApp();
  const today = new Date().toISOString().split('T')[0];
  const amountInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    date: today,
    amount: '',
    category: '',
    note: '',
    account: '',
    asset: 'USD'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedAccount, setSuggestedAccount] = useState<string>('');
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);

  // Smart defaults based on user behavior
  useEffect(() => {
    if (!isOpen) return;

    // Get recent expenses to learn user patterns
    const recent = transactions?.slice(0, 10).filter(t => t.type === 'expense') || [];
    setRecentExpenses(recent);

    // Find most frequently used account
    if (recent.length > 0) {
      const accountFrequency: { [key: string]: number } = {};
      recent.forEach(exp => {
        accountFrequency[exp.account] = (accountFrequency[exp.account] || 0) + 1;
      });

      const mostUsedAccount = Object.entries(accountFrequency)
        .sort(([,a], [,b]) => b - a)[0]?.[0];

      if (mostUsedAccount && accounts?.some(acc => acc.name === mostUsedAccount)) {
        setSuggestedAccount(mostUsedAccount);
        setFormData(prev => ({ ...prev, account: mostUsedAccount }));
      }

      // Find most frequently used category
      const categoryFrequency: { [key: string]: number } = {};
      recent.forEach(exp => {
        if (exp.tag) {
          categoryFrequency[exp.tag] = (categoryFrequency[exp.tag] || 0) + 1;
        }
      });

      const mostUsedCategory = Object.entries(categoryFrequency)
        .sort(([,a], [,b]) => b - a)[0]?.[0];

      if (mostUsedCategory && tags?.some(tag => tag.name === mostUsedCategory)) {
        setFormData(prev => ({ ...prev, category: mostUsedCategory }));
      }
    }
  }, [isOpen, transactions, accounts, tags]);

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
      const transactionData = {
        date: formData.date,
        type: 'expense',
        quantity: '1',
        price_local: formData.amount,
        amount_local: formData.amount,
        asset: formData.asset,
        account: formData.account || suggestedAccount || 'Default',
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

  const handleQuickAmount = (amount: number) => {
    setFormData(prev => ({ ...prev, amount: amount.toString() }));
    // Focus note field after selecting amount
    setTimeout(() => {
      const noteInput = document.querySelector('input[placeholder*="expense"]');
      if (noteInput) (noteInput as HTMLInputElement).focus();
    }, 100);
  };

  const handleQuickCategory = (category: string) => {
    setFormData(prev => ({ ...prev, category }));
    // Auto-generate note based on category
    const categoryNote = generateNoteFromCategory(category);
    setFormData(prev => ({ ...prev, note: categoryNote }));
  };

  const generateNoteFromCategory = (category: string): string => {
    const suggestions: { [key: string]: string[] } = {
      'Food': ['Lunch', 'Dinner', 'Groceries', 'Snack', 'Coffee'],
      'Transport': ['Gas', 'Uber', 'Bus fare', 'Parking', 'Maintenance'],
      'Shopping': ['Clothes', 'Electronics', 'Household items'],
      'Entertainment': ['Movie', 'Gaming', 'Subscription'],
      'Bills': ['Electricity', 'Internet', 'Phone', 'Rent'],
      'Healthcare': ['Medicine', 'Doctor visit', 'Insurance'],
      'Coffee': ['Morning coffee', 'Afternoon pick-me-up'],
      'Gas': ['Fuel tank', 'Car maintenance']
    };

    const categorySuggestions = suggestions[category] || [];
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
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  // Get available categories with icons - show common categories even if no tags exist
  const availableCategories = COMMON_CATEGORIES.filter(cat =>
    !tags?.length || tags?.some(tag => tag.name === cat.name && tag.is_active)
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Quick Expense</h3>
            <p className="text-sm text-gray-500 mt-1">
              {suggestedAccount && `Using: ${suggestedAccount}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Quick Amount Buttons */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Quick Amount
          </label>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_AMOUNTS.map(amount => (
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
            />
          </div>
        </div>

        {/* Quick Category Selection */}
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
            placeholder="What was this expense for?"
          />

          {/* Recent expense suggestions */}
          {recentExpenses.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-2">Recent:</p>
              <div className="flex flex-wrap gap-1">
                {recentExpenses.slice(0, 5).map((expense, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        note: expense.note || `${expense.tag} expense`
                      }));
                    }}
                    className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    {expense.note?.slice(0, 15) || expense.tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Account Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Account
          </label>
          <select
            value={formData.account}
            onChange={(e) => handleInputChange('account', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select account...</option>
            {accounts?.map(account => (
              <option key={account.name} value={account.name}>
                {account.name}
              </option>
            ))}
          </select>
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
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.amount || !formData.category}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {isSubmitting ? 'Saving...' : 'Save Expense'}
          </button>
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-400">
            Press <kbd>Ctrl+Enter</kbd> to save • <kbd>Esc</kbd> to cancel
          </p>
        </div>
      </div>
    </div>
  );
};

export default QuickExpenseModal;