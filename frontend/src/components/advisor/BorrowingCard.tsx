import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercentage } from "@/utils/currencyFormatter";
import type { BorrowingAnalysis } from "@/types/aiAdvisor";

interface BorrowingCardProps {
  data: BorrowingAnalysis;
  currency?: string;
}

const BorrowingCard: React.FC<BorrowingCardProps> = ({ data, currency = "USD" }) => {
  const isUSD = currency === "USD";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <span className="text-2xl">💳</span>
          Borrowing Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Total Debt */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Total Debt</p>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(
                isUSD ? data.totalDebt.usd : data.totalDebt.vnd,
                currency,
              )}
            </p>
          </div>

          {/* Monthly Payments */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Monthly Payments</p>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(
                isUSD ? data.monthlyPayments.usd : data.monthlyPayments.vnd,
                currency,
              )}
            </p>
          </div>

          {/* Debt-to-Income Ratio */}
          <div
            className={`p-4 rounded-lg ${
              data.debtToIncomeRatio > 40
                ? "bg-red-50"
                : data.debtToIncomeRatio > 20
                  ? "bg-yellow-50"
                  : "bg-green-50"
            }`}
          >
            <p className="text-sm text-gray-600 mb-1">Debt-to-Income Ratio</p>
            <p
              className={`text-xl font-bold ${
                data.debtToIncomeRatio > 40
                  ? "text-red-600"
                  : data.debtToIncomeRatio > 20
                    ? "text-yellow-600"
                    : "text-green-600"
              }`}
            >
              {formatPercentage(data.debtToIncomeRatio / 100, 1)}
            </p>
          </div>
        </div>

        {data.insights.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Insights</p>
            <ul className="space-y-2">
              {data.insights.map((insight, idx) => (
                <li
                  key={idx}
                  className="text-sm flex items-start gap-2 text-gray-600"
                >
                  <span className="text-gray-400 mt-0.5">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BorrowingCard;
