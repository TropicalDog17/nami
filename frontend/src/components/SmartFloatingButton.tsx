import React, { useState } from 'react';

interface SmartFloatingButtonProps {
  onExpenseClick: () => void;
  onIncomeClick: () => void;
  onTransferClick: () => void;
}

const SmartFloatingButton: React.FC<SmartFloatingButtonProps> = ({
  onExpenseClick,
  onIncomeClick,
  onTransferClick
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleMainClick = () => {
    setIsExpanded(!isExpanded);
  };

  const handleActionClick = (action: () => void) => {
    action();
    setIsExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsExpanded(false);
    }
  };

  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isExpanded]);

  return (
    <div className="fixed bottom-8 right-8 z-40" onKeyDown={handleKeyDown}>
      {/* Action Buttons */}
      <div className={`relative ${isExpanded ? 'mb-4' : 'mb-0'}`}>
        {/* Expense Button */}
        <div
          className={`absolute bottom-full right-0 mb-3 transition-all duration-300 ${
            isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
        >
          <button
            onClick={() => handleActionClick(onExpenseClick)}
            className="flex items-center px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg transition-all duration-200 whitespace-nowrap"
            aria-label="Add expense"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Add Expense
          </button>
        </div>

        {/* Income Button */}
        <div
          className={`absolute bottom-full right-0 mb-3 transition-all duration-300 ${
            isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
          style={{ marginBottom: isExpanded ? '3.5rem' : '0' }}
        >
          <button
            onClick={() => handleActionClick(onIncomeClick)}
            className="flex items-center px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg shadow-lg transition-all duration-200 whitespace-nowrap"
            aria-label="Add income"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Add Income
          </button>
        </div>

        {/* Transfer Button */}
        <div
          className={`absolute bottom-full right-0 mb-3 transition-all duration-300 ${
            isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
          style={{ marginBottom: isExpanded ? '7rem' : '0' }}
        >
          <button
            onClick={() => handleActionClick(onTransferClick)}
            className="flex items-center px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-lg transition-all duration-200 whitespace-nowrap"
            aria-label="Transfer money"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Transfer
          </button>
        </div>
      </div>

      {/* Main Add Button */}
      <button
        onClick={handleMainClick}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          isExpanded
            ? 'bg-gray-600 hover:bg-gray-700 rotate-45'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
        aria-label={isExpanded ? 'Close actions' : 'Add transaction'}
        aria-expanded={isExpanded}
      >
        <svg
          className={`w-6 h-6 transition-transform duration-300 ${isExpanded ? 'rotate-45' : ''}`}
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

      {/* Tooltip */}
      {!isExpanded && (
        <div className="absolute bottom-full right-0 mb-3 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg opacity-0 pointer-events-none transition-opacity duration-200 whitespace-nowrap">
          Add Transaction
          <div className="absolute top-full right-6 -mt-1">
            <div className="w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-gray-800"></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartFloatingButton;