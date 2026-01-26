import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/utils/currencyFormatter';

interface Transaction {
  id: string;
  description: string;
  amount_usd: number;
  amount_vnd: number;
  createdAt: string;
  account: string;
}

interface CategoryExpensesModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: string;
  transactions: Transaction[];
  currency: 'USD' | 'VND';
}

const CategoryExpensesModal: React.FC<CategoryExpensesModalProps> = ({
  isOpen,
  onClose,
  category,
  transactions,
  currency,
}) => {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {category} Expenses ({transactions.length})
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {tx.description}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(tx.createdAt)} • {tx.account}
                  </p>
                </div>
                <div className="ml-4 flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {formatCurrency(
                      currency === 'USD' ? tx.amount_usd : tx.amount_vnd,
                      currency
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CategoryExpensesModal;
