/**
 * Storage layer for AI Advisor - manages analysis cache and history
 */

import { promises as fs } from "fs";
import path from "path";
import { logger } from "../utils/logger.js";

const DATA_DIR = path.join(process.cwd(), "data", "ai-advisor");
const HISTORY_FILE = path.join(DATA_DIR, "analysis-history.json");
const MAX_HISTORY_ITEMS = 10; // Keep last 10 analyses

/**
 * Financial analysis response structure
 */
export interface FinancialAnalysis {
  generatedAt: string;
  cashFlowHealth: {
    score: "healthy" | "warning" | "critical";
    summary: string;
    insights: string[];
  };
  borrowingAnalysis: {
    totalDebt: { vnd: number; usd: number };
    monthlyPayments: { vnd: number; usd: number };
    debtToIncomeRatio: number;
    insights: string[];
  };
  spendingPatterns: {
    topCategories: { tag: string; amount: number; percentOfTotal: number }[];
    unusualSpending: string[];
    insights: string[];
  };
  recommendations: {
    priority: "high" | "medium" | "low";
    category: "saving" | "debt" | "spending" | "investment";
    title: string;
    description: string;
  }[];
}

/**
 * Cached analysis storage structure
 */
export interface CachedAnalysis {
  id: string;
  analysis: FinancialAnalysis;
  generatedAt: string;
  monthlyIncome?: number;
}

/**
 * Analysis history storage structure
 */
export interface AnalysisHistory {
  analyses: CachedAnalysis[];
  lastUpdated: string;
}

/**
 * Comparison between two analyses
 */
export interface AnalysisComparison {
  current: CachedAnalysis;
  previous: CachedAnalysis;
  changes: {
    healthScoreChange: {
      from: "healthy" | "warning" | "critical";
      to: "healthy" | "warning" | "critical";
      improved: boolean | null; // null if same
    };
    debtChange: {
      vnd: number;
      usd: number;
      percentChange: number;
    };
    monthlyPaymentsChange: {
      vnd: number;
      usd: number;
      percentChange: number;
    };
    debtToIncomeChange: {
      from: number;
      to: number;
      percentChange: number;
      improved: boolean | null;
    };
    spendingChanges: {
      tag: string;
      previousAmount: number;
      currentAmount: number;
      percentChange: number;
    }[];
    newRecommendations: number;
    newRecommendationTitles: string[];
    resolvedRecommendations: number;
    resolvedRecommendationTitles: string[];
  };
}

/**
 * Generate a unique ID for an analysis
 */
function generateId(): string {
  return `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Ensure data directory exists
 */
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    logger.error({ err: error, DATA_DIR }, "Failed to create data directory");
    throw error;
  }
}

/**
 * Load analysis history
 */
async function loadHistory(): Promise<AnalysisHistory> {
  try {
    const data = await fs.readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(data) as AnalysisHistory;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return { analyses: [], lastUpdated: new Date().toISOString() };
    }
    logger.error({ err: error }, "Failed to load analysis history");
    return { analyses: [], lastUpdated: new Date().toISOString() };
  }
}

/**
 * Save analysis history
 */
async function saveHistory(history: AnalysisHistory): Promise<void> {
  await ensureDataDir();
  history.lastUpdated = new Date().toISOString();
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * Save analysis to history (keeps last MAX_HISTORY_ITEMS)
 */
export async function saveAnalysis(
  analysis: FinancialAnalysis,
  monthlyIncome?: number,
): Promise<CachedAnalysis> {
  const history = await loadHistory();

  const cached: CachedAnalysis = {
    id: generateId(),
    analysis,
    generatedAt: new Date().toISOString(),
    monthlyIncome,
  };

  // Add to beginning of array (newest first)
  history.analyses.unshift(cached);

  // Keep only the last MAX_HISTORY_ITEMS
  if (history.analyses.length > MAX_HISTORY_ITEMS) {
    history.analyses = history.analyses.slice(0, MAX_HISTORY_ITEMS);
  }

  await saveHistory(history);
  logger.info({ id: cached.id }, "Analysis saved to history");

  return cached;
}

/**
 * Load the most recent cached analysis
 * Returns null if no cached analysis exists
 */
export async function loadAnalysis(): Promise<CachedAnalysis | null> {
  const history = await loadHistory();

  if (history.analyses.length === 0) {
    logger.debug("No cached analysis found");
    return null;
  }

  logger.debug("Cached analysis loaded successfully");
  return history.analyses[0];
}

/**
 * Load all analysis history
 */
export async function loadAnalysisHistory(): Promise<CachedAnalysis[]> {
  const history = await loadHistory();
  return history.analyses;
}

/**
 * Load a specific analysis by ID
 */
export async function loadAnalysisById(id: string): Promise<CachedAnalysis | null> {
  const history = await loadHistory();
  return history.analyses.find(a => a.id === id) || null;
}

/**
 * Check if cached analysis is fresh (less than 24 hours old)
 */
export async function isAnalysisFresh(): Promise<boolean> {
  const cached = await loadAnalysis();
  if (!cached) {
    return false;
  }
  const cachedTime = new Date(cached.generatedAt).getTime();
  const now = Date.now();
  const hoursSinceCache = (now - cachedTime) / (1000 * 60 * 60);
  return hoursSinceCache < 24;
}

/**
 * Delete all analysis history
 */
export async function deleteAnalysis(): Promise<void> {
  try {
    await fs.unlink(HISTORY_FILE);
    logger.info("Analysis history deleted successfully");
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      logger.error({ err: error }, "Failed to delete analysis history");
      throw error;
    }
  }
}

/**
 * Compare two analyses and return the changes
 */
export function compareAnalyses(
  current: CachedAnalysis,
  previous: CachedAnalysis,
): AnalysisComparison {
  const currentAnalysis = current.analysis;
  const previousAnalysis = previous.analysis;

  // Health score comparison
  const healthScoreOrder = { critical: 0, warning: 1, healthy: 2 };
  const currentHealthScore = healthScoreOrder[currentAnalysis.cashFlowHealth.score];
  const previousHealthScore = healthScoreOrder[previousAnalysis.cashFlowHealth.score];
  const healthImproved = currentHealthScore > previousHealthScore ? true :
                         currentHealthScore < previousHealthScore ? false : null;

  // Debt changes
  const prevDebt = previousAnalysis.borrowingAnalysis.totalDebt;
  const currDebt = currentAnalysis.borrowingAnalysis.totalDebt;
  const debtPercentChange = prevDebt.usd !== 0
    ? ((currDebt.usd - prevDebt.usd) / prevDebt.usd) * 100
    : (currDebt.usd > 0 ? 100 : 0);

  // Monthly payments changes
  const prevPayments = previousAnalysis.borrowingAnalysis.monthlyPayments;
  const currPayments = currentAnalysis.borrowingAnalysis.monthlyPayments;
  const paymentsPercentChange = prevPayments.usd !== 0
    ? ((currPayments.usd - prevPayments.usd) / prevPayments.usd) * 100
    : (currPayments.usd > 0 ? 100 : 0);

  // DTI changes
  const prevDTI = previousAnalysis.borrowingAnalysis.debtToIncomeRatio;
  const currDTI = currentAnalysis.borrowingAnalysis.debtToIncomeRatio;
  const dtiPercentChange = prevDTI !== 0
    ? ((currDTI - prevDTI) / prevDTI) * 100
    : (currDTI > 0 ? 100 : 0);
  const dtiImproved = currDTI < prevDTI ? true : currDTI > prevDTI ? false : null;

  // Spending changes
  const prevCategories = new Map(
    previousAnalysis.spendingPatterns.topCategories.map(c => [c.tag, c.amount])
  );
  const spendingChanges = currentAnalysis.spendingPatterns.topCategories.map(curr => {
    const prevAmount = prevCategories.get(curr.tag) || 0;
    const percentChange = prevAmount !== 0
      ? ((curr.amount - prevAmount) / prevAmount) * 100
      : (curr.amount > 0 ? 100 : 0);
    return {
      tag: curr.tag,
      previousAmount: prevAmount,
      currentAmount: curr.amount,
      percentChange,
    };
  });

  // Recommendation changes
  const prevRecTitles = new Set(previousAnalysis.recommendations.map(r => r.title));
  const currRecTitles = new Set(currentAnalysis.recommendations.map(r => r.title));
  const newRecs = currentAnalysis.recommendations.filter(r => !prevRecTitles.has(r.title));
  const resolvedRecs = previousAnalysis.recommendations.filter(r => !currRecTitles.has(r.title));

  return {
    current,
    previous,
    changes: {
      healthScoreChange: {
        from: previousAnalysis.cashFlowHealth.score,
        to: currentAnalysis.cashFlowHealth.score,
        improved: healthImproved,
      },
      debtChange: {
        vnd: currDebt.vnd - prevDebt.vnd,
        usd: currDebt.usd - prevDebt.usd,
        percentChange: debtPercentChange,
      },
      monthlyPaymentsChange: {
        vnd: currPayments.vnd - prevPayments.vnd,
        usd: currPayments.usd - prevPayments.usd,
        percentChange: paymentsPercentChange,
      },
      debtToIncomeChange: {
        from: prevDTI,
        to: currDTI,
        percentChange: dtiPercentChange,
        improved: dtiImproved,
      },
      spendingChanges,
      newRecommendations: newRecs.length,
      newRecommendationTitles: newRecs.map(r => r.title),
      resolvedRecommendations: resolvedRecs.length,
      resolvedRecommendationTitles: resolvedRecs.map(r => r.title),
    },
  };
}
