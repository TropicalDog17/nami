import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalysisComparison } from "@/types/aiAdvisor";

interface ComparisonCardProps {
  comparison: AnalysisComparison;
  currency: "USD" | "VND";
}

// Simple tooltip component
const Tooltip = ({
  children,
  content,
}: {
  children: React.ReactNode;
  content: string[];
}) => {
  const [show, setShow] = useState(false);

  if (!content || content.length === 0) {
    return <>{children}</>;
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
            <ul className="space-y-1">
              {content.map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
};

const formatCurrency = (amount: number, currency: "USD" | "VND"): string => {
  if (currency === "VND") {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatPercent = (value: number): string => {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
};

const ChangeIndicator = ({
  value,
  improved,
  inverted = false,
}: {
  value: number;
  improved: boolean | null;
  inverted?: boolean;
}) => {
  if (value === 0 || improved === null) {
    return <span className="text-gray-500">No change</span>;
  }

  // For inverted metrics (like debt), lower is better
  const isPositive = inverted ? improved : improved;

  return (
    <span className={isPositive ? "text-green-600" : "text-red-600"}>
      {formatPercent(value)}
      {isPositive ? " ↓" : " ↑"}
    </span>
  );
};

const HealthBadge = ({ score }: { score: "healthy" | "warning" | "critical" }) => {
  const colors = {
    healthy: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    critical: "bg-red-100 text-red-800",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[score]}`}>
      {score.charAt(0).toUpperCase() + score.slice(1)}
    </span>
  );
};

export default function ComparisonCard({ comparison, currency }: ComparisonCardProps) {
  const { changes, current, previous } = comparison;
  const currencyKey = currency.toLowerCase() as "usd" | "vnd";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          Changes Since Last Analysis
        </CardTitle>
        <p className="text-sm text-gray-500">
          Comparing {new Date(current.generatedAt).toLocaleDateString()} vs{" "}
          {new Date(previous.generatedAt).toLocaleDateString()}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Health Score Change */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-700 mb-2">Financial Health</h4>
          <div className="flex items-center gap-4">
            <HealthBadge score={changes.healthScoreChange.from} />
            <span className="text-gray-400">→</span>
            <HealthBadge score={changes.healthScoreChange.to} />
            {changes.healthScoreChange.improved !== null && (
              <span
                className={
                  changes.healthScoreChange.improved
                    ? "text-green-600 text-sm"
                    : "text-red-600 text-sm"
                }
              >
                {changes.healthScoreChange.improved ? "Improved!" : "Declined"}
              </span>
            )}
          </div>
        </div>

        {/* Debt Changes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border rounded-lg">
            <h4 className="text-sm font-medium text-gray-500 mb-1">Total Debt</h4>
            <p className="text-lg font-semibold">
              {formatCurrency(
                changes.debtChange[currencyKey] > 0
                  ? changes.debtChange[currencyKey]
                  : Math.abs(changes.debtChange[currencyKey]),
                currency
              )}
            </p>
            <ChangeIndicator
              value={changes.debtChange.percentChange}
              improved={changes.debtChange.percentChange < 0}
              inverted={true}
            />
          </div>

          <div className="p-4 border rounded-lg">
            <h4 className="text-sm font-medium text-gray-500 mb-1">Monthly Payments</h4>
            <p className="text-lg font-semibold">
              {formatCurrency(
                Math.abs(changes.monthlyPaymentsChange[currencyKey]),
                currency
              )}
            </p>
            <ChangeIndicator
              value={changes.monthlyPaymentsChange.percentChange}
              improved={changes.monthlyPaymentsChange.percentChange < 0}
              inverted={true}
            />
          </div>
        </div>

        {/* DTI Change */}
        <div className="p-4 border rounded-lg">
          <h4 className="text-sm font-medium text-gray-500 mb-1">
            Debt-to-Income Ratio
          </h4>
          <div className="flex items-center gap-4">
            <span className="text-lg font-semibold">
              {changes.debtToIncomeChange.from.toFixed(1)}%
            </span>
            <span className="text-gray-400">→</span>
            <span className="text-lg font-semibold">
              {changes.debtToIncomeChange.to.toFixed(1)}%
            </span>
            <ChangeIndicator
              value={changes.debtToIncomeChange.percentChange}
              improved={changes.debtToIncomeChange.improved}
              inverted={true}
            />
          </div>
        </div>

        {/* Spending Changes */}
        {changes.spendingChanges.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-700 mb-3">Spending by Category</h4>
            <div className="space-y-2">
              {changes.spendingChanges.slice(0, 5).map((change) => (
                <div
                  key={change.tag}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <span className="text-sm font-medium">{change.tag}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                      {formatCurrency(change.previousAmount, currency)} →{" "}
                      {formatCurrency(change.currentAmount, currency)}
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        change.percentChange > 0
                          ? "text-red-600"
                          : change.percentChange < 0
                          ? "text-green-600"
                          : "text-gray-500"
                      }`}
                    >
                      {formatPercent(change.percentChange)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations Summary */}
        <div className="flex gap-4">
          {changes.newRecommendations > 0 && (
            <Tooltip content={changes.newRecommendationTitles || []}>
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg cursor-help">
                <span className="text-lg">📝</span>
                <span className="text-sm font-medium">
                  {changes.newRecommendations} new recommendation
                  {changes.newRecommendations !== 1 ? "s" : ""}
                </span>
              </div>
            </Tooltip>
          )}
          {changes.resolvedRecommendations > 0 && (
            <Tooltip content={changes.resolvedRecommendationTitles || []}>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg cursor-help">
                <span className="text-lg">✅</span>
                <span className="text-sm font-medium">
                  {changes.resolvedRecommendations} resolved
                </span>
              </div>
            </Tooltip>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
