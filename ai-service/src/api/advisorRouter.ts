/**
 * AI Advisor API router
 * Handles analysis generation using existing configured model provider
 */

import { Router, Request, Response } from "express";
import { createCorrelationLogger } from "../utils/logger.js";
import {
  saveAnalysis,
  loadAnalysis,
  loadAnalysisHistory,
  loadAnalysisById,
  isAnalysisFresh,
  compareAnalyses,
  type FinancialAnalysis,
  type CachedAnalysis,
} from "../core/advisorStorage.js";
import { generateAnalysis } from "../core/advisorAnalysis.js";

export const advisorRouter = Router();

/**
 * Generate correlation ID from request
 */
function getCorrelationId(req: Request): string {
  return (
    req.headers["x-correlation-id"] as string | undefined ||
    req.headers["x-request-id"] as string | undefined ||
    crypto.randomUUID()
  );
}

/**
 * GET /api/advisor/status
 * Check cached analysis availability
 */
advisorRouter.get("/status", async (req: Request, res: Response) => {
  const correlationId = getCorrelationId(req);
  const logger = createCorrelationLogger(correlationId);

  try {
    const cached = await loadAnalysis();
    const isFresh = cached ? await isAnalysisFresh() : false;
    const history = await loadAnalysisHistory();

    logger.info(
      { hasAnalysis: !!cached, isFresh, historyCount: history.length },
      "Advisor status check",
    );

    res.json({
      connected: true, // Always true when using existing model
      hasAnalysis: !!cached,
      isFresh,
      analysisGeneratedAt: cached?.generatedAt || null,
      historyCount: history.length,
    });
  } catch (error: any) {
    logger.error({ err: error }, "Failed to check advisor status");
    res.status(500).json({ error: "Failed to check status" });
  }
});

/**
 * POST /api/advisor/generate
 * Generate a new financial analysis
 * Body: { monthlyIncome?: number } - Optional monthly income in USD for accurate DTI calculation
 */
advisorRouter.post("/generate", async (req: Request, res: Response) => {
  const correlationId = getCorrelationId(req);
  const logger = createCorrelationLogger(correlationId);

  try {
    const { monthlyIncome } = req.body;

    logger.info(
      { hasMonthlyIncome: !!monthlyIncome, monthlyIncome },
      "Starting analysis generation",
    );

    // Generate analysis using existing configured model
    const analysis = await generateAnalysis(correlationId, monthlyIncome);

    // Cache the analysis with monthly income
    const cached = await saveAnalysis(analysis, monthlyIncome);

    logger.info(
      {
        id: cached.id,
        cashFlowScore: analysis.cashFlowHealth.score,
        recommendationsCount: analysis.recommendations.length,
      },
      "Analysis generated and cached",
    );

    res.json(analysis);
  } catch (error: any) {
    logger.error({ err: error }, "Failed to generate analysis");
    res.status(500).json({
      error: "Failed to generate analysis",
      message: error.message,
    });
  }
});

/**
 * GET /api/advisor/analysis
 * Get the cached analysis
 */
advisorRouter.get("/analysis", async (req: Request, res: Response) => {
  const correlationId = getCorrelationId(req);
  const logger = createCorrelationLogger(correlationId);

  try {
    const cached = await loadAnalysis();

    if (!cached) {
      logger.info({}, "No cached analysis found");
      return res.status(404).json({
        error: "No analysis found",
        message: "Generate an analysis first",
      });
    }

    logger.info(
      { generatedAt: cached.generatedAt },
      "Returned cached analysis",
    );

    // Return just the analysis, not the wrapper
    res.json(cached.analysis);
  } catch (error: any) {
    logger.error({ err: error }, "Failed to load cached analysis");
    res.status(500).json({ error: "Failed to load analysis" });
  }
});

/**
 * GET /api/advisor/history
 * Get all analysis history
 */
advisorRouter.get("/history", async (req: Request, res: Response) => {
  const correlationId = getCorrelationId(req);
  const logger = createCorrelationLogger(correlationId);

  try {
    const history = await loadAnalysisHistory();

    logger.info(
      { count: history.length },
      "Returned analysis history",
    );

    res.json(history);
  } catch (error: any) {
    logger.error({ err: error }, "Failed to load analysis history");
    res.status(500).json({ error: "Failed to load history" });
  }
});

/**
 * GET /api/advisor/history/:id
 * Get a specific analysis by ID
 */
advisorRouter.get("/history/:id", async (req: Request, res: Response) => {
  const correlationId = getCorrelationId(req);
  const logger = createCorrelationLogger(correlationId);

  try {
    const { id } = req.params;
    const cached = await loadAnalysisById(id);

    if (!cached) {
      logger.info({ id }, "Analysis not found");
      return res.status(404).json({
        error: "Analysis not found",
        message: `No analysis found with ID: ${id}`,
      });
    }

    logger.info(
      { id, generatedAt: cached.generatedAt },
      "Returned specific analysis",
    );

    res.json(cached);
  } catch (error: any) {
    logger.error({ err: error }, "Failed to load specific analysis");
    res.status(500).json({ error: "Failed to load analysis" });
  }
});

/**
 * GET /api/advisor/compare
 * Compare current analysis with previous one
 * Query params:
 *   - currentId: ID of current analysis (optional, defaults to most recent)
 *   - previousId: ID of previous analysis (optional, defaults to second most recent)
 */
advisorRouter.get("/compare", async (req: Request, res: Response) => {
  const correlationId = getCorrelationId(req);
  const logger = createCorrelationLogger(correlationId);

  try {
    const { currentId, previousId } = req.query;
    const history = await loadAnalysisHistory();

    if (history.length < 2) {
      logger.info({ historyCount: history.length }, "Not enough history for comparison");
      return res.status(400).json({
        error: "Not enough history",
        message: "Need at least 2 analyses to compare",
      });
    }

    let current: CachedAnalysis | null = null;
    let previous: CachedAnalysis | null = null;

    if (currentId && typeof currentId === "string") {
      current = await loadAnalysisById(currentId);
      if (!current) {
        return res.status(404).json({
          error: "Current analysis not found",
          message: `No analysis found with ID: ${currentId}`,
        });
      }
    } else {
      current = history[0];
    }

    if (previousId && typeof previousId === "string") {
      previous = await loadAnalysisById(previousId);
      if (!previous) {
        return res.status(404).json({
          error: "Previous analysis not found",
          message: `No analysis found with ID: ${previousId}`,
        });
      }
    } else {
      // Find the next oldest analysis after current
      const currentIndex = history.findIndex(a => a.id === current!.id);
      if (currentIndex < history.length - 1) {
        previous = history[currentIndex + 1];
      } else {
        return res.status(400).json({
          error: "No previous analysis",
          message: "No analysis older than the current one exists",
        });
      }
    }

    const comparison = compareAnalyses(current, previous);

    logger.info(
      {
        currentId: current.id,
        previousId: previous.id,
        healthChange: comparison.changes.healthScoreChange,
      },
      "Returned analysis comparison",
    );

    res.json(comparison);
  } catch (error: any) {
    logger.error({ err: error }, "Failed to compare analyses");
    res.status(500).json({ error: "Failed to compare analyses" });
  }
});
