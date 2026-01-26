import React from 'react';
import { formatCurrency } from '@/utils/currencyFormatter';

interface Transaction {
  id: string;
  description: string;
  amount_usd: number;
  amount_vnd: number;
  createdAt: string;
  account: string;
}

interface CategoryTooltipProps {
  transactions: Transaction[];
  currency: 'USD' | 'VND';
  maxItems?: number;
}

const CategoryTooltip: React.FC<CategoryTooltipProps> = ({
  transactions,
  currency,
  maxItems = 5,
}) => {
  const topTransactions = transactions.slice(0, maxItems);

  return (
    <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[280px] max-w-[400px]">
      <h4 className="text-sm font-semibold text-gray-900 mb-2">
        Top {maxItems} Expenses
      </h4>
      <div className="space-y-2">
        {topTransactions.map((tx, idx) => (
          <div key={tx.id} className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-gray-400">
                  #{idx + 1}
                </span>
                <p className="text-xs text-gray-900 truncate">
                  {tx.description}
                </p>
              </div>
              <p className="text-xs text-gray-500 truncate">
                {new Date(tx.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div className="flex-shrink-0">
              <p className="text-xs font-semibold text-gray-900">
                {formatCurrency(
                  currency === 'USD' ? tx.amount_usd : tx.amount_vnd,
                  currency
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
      {transactions.length > maxItems && (
        <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
          +{transactions.length - maxItems} more expenses. Click to view all.
        </p>
      )}
    </div>
  );
};

export default CategoryTooltip;
