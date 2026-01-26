import React, { useState, useRef, useEffect } from 'react';
import CategoryTooltip from './CategoryTooltip';
import CategoryExpensesModal from './CategoryExpensesModal';

interface Transaction {
  id: string;
  description: string;
  amount_usd: number;
  amount_vnd: number;
  createdAt: string;
  account: string;
}

interface CategoryRowProps {
  tag: string;
  amount: number;
  percentage: number;
  count: number;
  transactions: Transaction[];
  currency: 'USD' | 'VND';
  currencySymbol: string;
}

const CategoryRow: React.FC<CategoryRowProps> = ({
  tag,
  amount,
  percentage,
  count,
  transactions,
  currency,
  currencySymbol,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (isHovered && rowRef.current) {
      const rect = rowRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top + window.scrollY,
        left: rect.right + window.scrollX + 10,
      });
    }
  }, [isHovered]);

  return (
    <>
      <tr
        ref={rowRef}
        className="hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-200"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setShowModal(true)}
      >
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {tag}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
          {currencySymbol}
          {amount.toLocaleString()}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
          <div className="flex items-center gap-2">
            <div className="w-16 bg-gray-200 rounded-full h-2">
              <div
                className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            <span>{percentage.toFixed(1)}%</span>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {count}
        </td>
      </tr>

      {/* Tooltip */}
      {isHovered && transactions.length > 0 && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          <CategoryTooltip
            transactions={transactions}
            currency={currency}
            maxItems={5}
          />
        </div>
      )}

      {/* Modal */}
      <CategoryExpensesModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        category={tag}
        transactions={transactions}
        currency={currency}
      />
    </>
  );
};

export default CategoryRow;
