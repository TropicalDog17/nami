import { useEffect, useState, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import HealthScoreCard from "@/components/advisor/HealthScoreCard";
import BorrowingCard from "@/components/advisor/BorrowingCard";
import SpendingCard from "@/components/advisor/SpendingCard";
import RecommendationsCard from "@/components/advisor/RecommendationsCard";
import ComparisonCard from "@/components/advisor/ComparisonCard";
import HistorySelector from "@/components/advisor/HistorySelector";

import api from "@/services/api";
import { aiAdvisorApi } from "@/services/api";
import type {
  AdvisorStatusResponse,
  FinancialAnalysis,
  CachedAnalysis,
  AnalysisComparison,
} from "@/types/aiAdvisor";
import { useBackendStatus } from "@/context/BackendStatusContext";

const AIAdvisorPage: React.FC = () => {
  const { isOnline } = useBackendStatus();

  // State
  const [status, setStatus] = useState<AdvisorStatusResponse | null>(null);
  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [history, setHistory] = useState<CachedAnalysis[]>([]);
  const [comparison, setComparison] = useState<AnalysisComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"USD" | "VND">("USD");
  const [monthlyIncome, setMonthlyIncome] = useState<string>("");
  const [showHistory, setShowHistory] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);

  // Fetch status and history
  const fetchStatus = useCallback(async () => {
    try {
      const response = (await aiAdvisorApi.getStatus()) as AdvisorStatusResponse | null;
      setStatus(response);

      // If we have a cached analysis, load it
      if (response && response.hasAnalysis) {
        const cached = (await aiAdvisorApi.getAnalysis()) as FinancialAnalysis;
        setAnalysis(cached);

        // Load history
        const historyData = (await aiAdvisorApi.getHistory()) as CachedAnalysis[];
        setHistory(historyData);

        if (historyData.length > 0) {
          setCurrentAnalysisId(historyData[0].id);
        }

        // If we have at least 2 analyses, fetch comparison
        if (response.historyCount >= 2) {
          try {
            const comp = (await aiAdvisorApi.compareAnalyses()) as AnalysisComparison;
            setComparison(comp);
          } catch {
            // Comparison is optional, don't set error
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to fetch status: ${message}`);
    }
  }, []);

  // Generate new analysis
  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const income = parseFloat(monthlyIncome);
      if (isNaN(income) || income <= 0) {
        setError("Please enter a valid monthly income amount");
        setLoading(false);
        return;
      }

      const response = (await api.post<FinancialAnalysis>('/api/advisor/generate', {
        monthlyIncome: income,
      })) as FinancialAnalysis;
      setAnalysis(response);
      await fetchStatus(); // Update status and history
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to generate analysis: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus, monthlyIncome]);

  // Load specific analysis from history
  const handleSelectAnalysis = useCallback(async (id: string) => {
    try {
      const cached = (await aiAdvisorApi.getAnalysisById(id)) as CachedAnalysis;
      if (cached) {
        setAnalysis(cached.analysis);
        setCurrentAnalysisId(cached.id);
        if (cached.monthlyIncome) {
          setMonthlyIncome(cached.monthlyIncome.toString());
        }

        // Update comparison to compare this with its predecessor
        if (history.length >= 2) {
          const currentIndex = history.findIndex(a => a.id === id);
          if (currentIndex < history.length - 1) {
            const comp = (await aiAdvisorApi.compareAnalyses(
              id,
              history[currentIndex + 1].id
            )) as AnalysisComparison;
            setComparison(comp);
          } else {
            setComparison(null);
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load analysis: ${message}`);
    }
  }, [history]);

  // Initial load
  useEffect(() => {
    if (!isOnline) return;

    fetchStatus();
  }, [isOnline, fetchStatus]);

  // Render loading state
  if (loading && !analysis) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading AI Advisor...</p>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (error && !status) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <Card className="bg-red-50 border-red-200 max-w-2xl mx-auto">
          <CardContent className="p-6 text-center">
            <p className="text-red-800 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No analysis yet - show generate button with monthly income input
  if (!analysis) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">AI Financial Advisor</h1>
          <p className="mt-1 text-sm text-gray-500">
            Get personalized financial insights powered by Claude
          </p>
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-8">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4">
              <span className="text-3xl">🤖</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">
              Ready to Analyze Your Finances
            </h2>
            <p className="text-gray-600 mb-6 text-center">
              Generate your first AI-powered financial analysis
            </p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="monthly-income" className="text-gray-700 font-medium">
                  Monthly Income (USD) *
                </Label>
                <Input
                  id="monthly-income"
                  type="number"
                  placeholder="e.g. 5000"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && monthlyIncome && !loading) {
                      handleGenerate();
                    }
                  }}
                  min="0"
                  step="0.01"
                  className="mt-1"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Required for accurate debt-to-income ratio calculation
                </p>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={loading || !monthlyIncome}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600"
              >
                {loading ? "Generating..." : "Generate Analysis"}
              </Button>
            </div>

            {error && (
              <p className="text-red-600 text-sm mt-4 text-center">{error}</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show analysis
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Financial Advisor</h1>
          <p className="mt-1 text-sm text-gray-500">
            Last updated: {new Date(analysis.generatedAt).toLocaleString()}
            {history.length > 1 && (
              <span className="ml-2 text-purple-600">
                • {history.length} analyses in history
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Currency Toggle */}
          <div className="flex items-center gap-1">
            <Button
              onClick={() => setCurrency("USD")}
              variant={currency === "USD" ? "default" : "secondary"}
              size="sm"
            >
              USD
            </Button>
            <Button
              onClick={() => setCurrency("VND")}
              variant={currency === "VND" ? "default" : "secondary"}
              size="sm"
            >
              VND
            </Button>
          </div>

          {/* History Button */}
          {history.length > 1 && (
            <Button
              onClick={() => setShowHistory(!showHistory)}
              variant={showHistory ? "default" : "outline"}
              size="sm"
            >
              📜 History
            </Button>
          )}

          {/* Compare Toggle */}
          {comparison && (
            <Button
              onClick={() => setShowComparison(!showComparison)}
              variant={showComparison ? "default" : "outline"}
              size="sm"
            >
              📊 Compare
            </Button>
          )}

          <Button
            onClick={async () => {
              // Prompt for new income when regenerating
              const newIncome = prompt("Enter your monthly income (USD):", monthlyIncome);
              if (newIncome !== null && newIncome.trim() !== "") {
                const income = parseFloat(newIncome);
                if (isNaN(income) || income <= 0) {
                  setError("Please enter a valid monthly income amount");
                  return;
                }
                setMonthlyIncome(newIncome);
                setLoading(true);
                setError(null);
                try {
                  const response = (await api.post<FinancialAnalysis>('/api/advisor/generate', {
                    monthlyIncome: income,
                  })) as FinancialAnalysis;
                  setAnalysis(response);
                  await fetchStatus();
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "Unknown error";
                  setError(`Failed to generate analysis: ${message}`);
                } finally {
                  setLoading(false);
                }
              }
            }}
            disabled={loading}
            variant="default"
          >
            {loading ? "Regenerating..." : "Regenerate"}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="bg-red-50 border-red-200 mb-6">
          <CardContent className="p-4">
            <p className="text-red-800">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading overlay when regenerating */}
      {loading && (
        <Card className="bg-purple-50 border-purple-200 mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
              <p className="text-purple-800">Generating new analysis... This may take up to 30 seconds.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History Selector */}
      {showHistory && (
        <HistorySelector
          history={history}
          currentId={currentAnalysisId || history[0]?.id || ""}
          onSelect={handleSelectAnalysis}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Comparison Card */}
      {showComparison && comparison && (
        <div className="mb-6">
          <ComparisonCard comparison={comparison} currency={currency} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Health Score - Full Width on Mobile */}
        <div className="lg:col-span-2">
          <HealthScoreCard data={analysis.cashFlowHealth} />
        </div>

        {/* Borrowing Analysis */}
        <BorrowingCard data={analysis.borrowingAnalysis} currency={currency} />

        {/* Spending Patterns */}
        <SpendingCard data={analysis.spendingPatterns} currency={currency} />

        {/* Recommendations - Full Width */}
        <div className="lg:col-span-2">
          <RecommendationsCard recommendations={analysis.recommendations} />
        </div>
      </div>
    </div>
  );
};

export default AIAdvisorPage;
