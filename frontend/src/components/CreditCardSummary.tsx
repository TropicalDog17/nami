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