import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercentage } from "@/utils/currencyFormatter";
import type { SpendingPatterns } from "@/types/aiAdvisor";

interface SpendingCardProps {
  data: SpendingPatterns;
  currency?: string;
}

const SpendingCard: React.FC<SpendingCardProps> = ({ data, currency = "USD" }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <span className="text-2xl">🛒</span>
          Spending Patterns
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Top Categories */}
        {data.topCategories.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Top Categories
            </p>
            <div className="space-y-3">
              {data.topCategories.map((category, idx) => (
                <div key={idx}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      {category.tag}
                    </span>
                    <span className="text-sm text-gray-600">
                      {formatCurrency(category.amount, currency)} (
                      {formatPercentage(category.percentOfTotal / 100, 1)})
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${category.percentOfTotal}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unusual Spending */}
        {data.unusualSpending.length > 0 && (
          <div className="mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-sm font-medium text-yellow-800 mb-2">
              ⚠️ Unusual Spending Detected
            </p>
            <ul className="space-y-1">
              {data.unusualSpending.map((item, idx) => (
                <li
                  key={idx}
                  className="text-sm flex items-start gap-2 text-yellow-700"
                >
                  <span className="text-yellow-500 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Insights */}
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

export default SpendingCard;
