import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CachedAnalysis } from "@/types/aiAdvisor";

interface HistorySelectorProps {
  history: CachedAnalysis[];
  currentId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export default function HistorySelector({
  history,
  currentId,
  onSelect,
  onClose,
}: HistorySelectorProps) {
  const [selectedId, setSelectedId] = useState<string>(currentId);

  const getHealthColor = (score: "healthy" | "warning" | "critical"): string => {
    switch (score) {
      case "healthy":
        return "bg-green-100 text-green-800";
      case "warning":
        return "bg-yellow-100 text-yellow-800";
      case "critical":
        return "bg-red-100 text-red-800";
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📜</span>
            Analysis History
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </CardTitle>
        <p className="text-sm text-gray-500">
          Select a previous analysis to view or compare
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {history.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`w-full p-3 rounded-lg border text-left transition-colors ${
                selectedId === item.id
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {new Date(item.generatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {index === 0 && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                        Latest
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(item.generatedAt).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {item.monthlyIncome && (
                      <span className="ml-2">
                        • Income: ${item.monthlyIncome.toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${getHealthColor(
                    item.analysis.cashFlowHealth.score
                  )}`}
                >
                  {item.analysis.cashFlowHealth.score}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSelect(selectedId);
              onClose();
            }}
            disabled={selectedId === currentId}
          >
            View Selected
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
