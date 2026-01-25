import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Recommendation } from "@/types/aiAdvisor";

interface RecommendationsCardProps {
  recommendations: Recommendation[];
}

const RecommendationsCard: React.FC<RecommendationsCardProps> = ({
  recommendations,
}) => {
  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case "high":
        return "text-red-600 bg-red-50 border-red-200";
      case "medium":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "low":
        return "text-green-600 bg-green-50 border-green-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getCategoryIcon = (category: string): string => {
    switch (category) {
      case "saving":
        return "💰";
      case "debt":
        return "💳";
      case "spending":
        return "🛒";
      case "investment":
        return "📈";
      default:
        return "💡";
    }
  };

  const sortedRecommendations = [...recommendations].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  if (sortedRecommendations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <span className="text-2xl">💡</span>
            Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">No recommendations at this time.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <span className="text-2xl">💡</span>
          Recommendations
        </CardTitle>
        <p className="text-sm text-gray-500">
          {sortedRecommendations.length} action item
          {sortedRecommendations.length > 1 ? "s" : ""}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedRecommendations.map((rec, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-lg border ${getPriorityColor(rec.priority)}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">{getCategoryIcon(rec.category)}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-gray-900">{rec.title}</h4>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full uppercase font-medium ${getPriorityColor(rec.priority)}`}
                    >
                      {rec.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{rec.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default RecommendationsCard;
