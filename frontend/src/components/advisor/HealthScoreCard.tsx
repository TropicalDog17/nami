import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CashFlowHealth } from "@/types/aiAdvisor";

interface HealthScoreCardProps {
  data: CashFlowHealth;
}

const HealthScoreCard: React.FC<HealthScoreCardProps> = ({ data }) => {
  const getScoreColor = (score: string): string => {
    switch (score) {
      case "healthy":
        return "text-green-600 bg-green-50 border-green-200";
      case "warning":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "critical":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getScoreIcon = (score: string): string => {
    switch (score) {
      case "healthy":
        return "✓";
      case "warning":
        return "⚠";
      case "critical":
        return "!";
      default:
        return "?";
    }
  };

  const colorClass = getScoreColor(data.score);
  const icon = getScoreIcon(data.score);

  return (
    <Card className={`${colorClass} border`}>
      <CardHeader>
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-lg font-bold shadow-sm">
            {icon}
          </span>
          Cash Flow Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <p className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-1">
            Status
          </p>
          <p className="text-2xl font-bold capitalize">{data.score}</p>
        </div>

        {data.summary && (
          <div className="mb-4">
            <p className="text-sm text-gray-600">{data.summary}</p>
          </div>
        )}

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

export default HealthScoreCard;
