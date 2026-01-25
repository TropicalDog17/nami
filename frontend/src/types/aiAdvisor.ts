/**
 * AI Advisor type definitions
 */

// ============================================================================
// API Response Types
// ============================================================================

export interface AdvisorStatusResponse {
  hasAnalysis: boolean;
  isFresh: boolean;
  analysisGeneratedAt: string | null;
  historyCount: number;
}

// ============================================================================
// Financial Analysis Types
// ============================================================================

export type HealthScore = "healthy" | "warning" | "critical";
export type RecommendationPriority = "high" | "medium" | "low";
export type RecommendationCategory = "saving" | "debt" | "spending" | "investment";

export interface CashFlowHealth {
  score: HealthScore;
  summary: string;
  insights: string[];
}

export interface BorrowingAnalysis {
  totalDebt: {
    vnd: number;
    usd: number;
  };
  monthlyPayments: {
    vnd: number;
    usd: number;
  };
  debtToIncomeRatio: number;
  insights: string[];
}

export interface SpendingCategory {
  tag: string;
  amount: number;
  percentOfTotal: number;
}

export interface SpendingPatterns {
  topCategories: SpendingCategory[];
  unusualSpending: string[];
  insights: string[];
}

export interface Recommendation {
  priority: RecommendationPriority;
  category: RecommendationCategory;
  title: string;
  description: string;
}

export interface FinancialAnalysis {
  generatedAt: string;
  cashFlowHealth: CashFlowHealth;
  borrowingAnalysis: BorrowingAnalysis;
  spendingPatterns: SpendingPatterns;
  recommendations: Recommendation[];
}

// ============================================================================
// History Types
// ============================================================================

export interface CachedAnalysis {
  id: string;
  analysis: FinancialAnalysis;
  generatedAt: string;
  monthlyIncome?: number;
}

// ============================================================================
// Comparison Types
// ============================================================================

export interface HealthScoreChange {
  from: HealthScore;
  to: HealthScore;
  improved: boolean | null; // null if same
}

export interface DebtChange {
  vnd: number;
  usd: number;
  percentChange: number;
}

export interface DebtToIncomeChange {
  from: number;
  to: number;
  percentChange: number;
  improved: boolean | null;
}

export interface SpendingChange {
  tag: string;
  previousAmount: number;
  currentAmount: number;
  percentChange: number;
}

export interface AnalysisChanges {
  healthScoreChange: HealthScoreChange;
  debtChange: DebtChange;
  monthlyPaymentsChange: DebtChange;
  debtToIncomeChange: DebtToIncomeChange;
  spendingChanges: SpendingChange[];
  newRecommendations: number;
  newRecommendationTitles: string[];
  resolvedRecommendations: number;
  resolvedRecommendationTitles: string[];
}

export interface AnalysisComparison {
  current: CachedAnalysis;
  previous: CachedAnalysis;
  changes: AnalysisChanges;
}
