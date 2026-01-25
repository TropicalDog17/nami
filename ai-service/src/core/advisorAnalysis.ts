/**
 * AI Advisor analysis generation using Claude API
 */

import { LLMClient } from "../integrations/llm.js";
import { loadConfig } from "../utils/config.js";
import { createCorrelationLogger } from "../utils/logger.js";
import type { FinancialAnalysis } from "./advisorStorage.js";

/**
 * Backend API response types
 */
interface CashflowResponse {
  combined_in_usd: number;
  combined_out_usd: number;
  combined_net_usd: number;
  operating_in_usd: number;
  operating_out_usd: number;
  operating_net_usd: number;
  financing_in_usd: number;
  financing_out_usd: number;
  financing_net_usd: number;
  by_type: Record<string, { inflow_usd: number; outflow_usd: number; net_usd: number }>;
}

interface SpendingResponse {
  total_usd: number;
  by_tag: Record<
    string,
    { total_usd: number; total_vnd: number; count: number; percentage: number }
  >;
  current_month_usd: number;
  last_month_usd: number;
  avg_daily_usd: number;
  available_balance_usd: number;
}

interface Borrowing {
  id: string;
  counterparty: string;
  asset: { type: string; symbol: string };
  principal: number;
  outstanding: number;
  monthlyPayment: number;
  interestRate: number;
  status: string;
}

interface VaultSummary {
  vault: string;
  aum_usd: number;
  aum_vnd: number;
  pnl_usd: number;
  pnl_vnd: number;
  roi_percent: number;
  apr_percent: number;
}

/**
 * Convert an amount to USD based on asset symbol and exchange rate
 */
function toUSD(amount: number, assetSymbol: string, vndToUsdRate: number): number {
  if (assetSymbol === "VND") {
    return amount * vndToUsdRate;
  }
  // Assume USD for other assets (can be extended for other currencies)
  return amount;
}

/**
 * System prompt for Claude analysis
 */
const ANALYSIS_SYSTEM_PROMPT = `You are a financial advisor AI assistant. Analyze the user's financial data and provide actionable insights.

You will receive:
1. Cash flow data (income, expenses, net flow)
2. Spending by category
3. Active borrowing/debt information
4. User-provided monthly income
5. Vault/portfolio performance (AUM, PnL, ROI, APR)

Your task:
1. Assess cash flow health as "healthy", "warning", or "critical"
2. Analyze debt situation and provide insights
3. Compare debt burden against investment performance to identify financing danger
4. Identify spending patterns and unusual trends
5. Provide specific, actionable recommendations

Important rules:
- Be concise and specific
- Focus on actionable insights
- Use simple, clear language
- Highlight both positives and concerns
- Prioritize recommendations by urgency

FINANCING DANGER ASSESSMENT:
- Compare total debt against portfolio AUM and PnL
- Warning signs: Debt > AUM, or Debt payments exceed monthly investment returns
- Critical: Negative PnL with high debt (owing money on losing investments)
- Healthy: Positive PnL, debt < 50% of AUM, debt payments manageable within income

DEBT-TO-INCOME RATIO (CRITICAL - DO NOT RECALCULATE):
- The borrowings section ALREADY CONTAINS the pre-calculated DTI ratio
- You MUST copy the exact DTI percentage value from "Debt-to-Income Ratio:" line in the borrowings section
- DO NOT calculate DTI yourself under any circumstances
- If the DTI shows 0%, the user may not have provided income - mention this in insights
- If you see a value like "0.0%" or similar, use that exact value
- A DTI above 40% is critical, 20-40% is warning, below 20% is healthy

Response format: Return a JSON object with the following structure:
{
  "cashFlowHealth": {
    "score": "healthy" | "warning" | "critical",
    "summary": "1-2 sentence summary",
    "insights": ["insight 1", "insight 2", "insight 3"]
  },
  "borrowingAnalysis": {
    "totalDebt": { "vnd": number, "usd": number },
    "monthlyPayments": { "vnd": number, "usd": number },
    "debtToIncomeRatio": number (percentage - EXACTLY as shown in data),
    "insights": ["insight 1", "insight 2"]
  },
  "spendingPatterns": {
    "topCategories": [
      { "tag": "category name", "amount": number (usd), "percentOfTotal": number }
    ],
    "unusualSpending": ["observation 1", "observation 2"],
    "insights": ["insight 1", "insight 2"]
  },
  "recommendations": [
    {
      "priority": "high" | "medium" | "low",
      "category": "saving" | "debt" | "spending" | "investment",
      "title": "short title",
      "description": "detailed explanation"
    }
  ]
}`;

/**
 * Build the user prompt with financial data
 */
function buildAnalysisPrompt(data: {
  cashflow: CashflowResponse;
  spending: SpendingResponse;
  borrowings: Borrowing[];
  monthlyIncome: number;
  vaults: VaultSummary[];
  vndToUsdRate: number;
}): string {
  const { cashflow, spending, borrowings, monthlyIncome, vaults, vndToUsdRate } = data;

  // Format cashflow section
  const cashflowSection = `
CASH FLOW (Recent period)
- Total Inflow: $${cashflow.combined_in_usd.toFixed(2)}
- Total Outflow: $${cashflow.combined_out_usd.toFixed(2)}
- Net Flow: $${cashflow.combined_net_usd.toFixed(2)}
- Operating Inflow: $${cashflow.operating_in_usd.toFixed(2)}
- Operating Outflow: $${cashflow.operating_out_usd.toFixed(2)}
- Operating Net: $${cashflow.operating_net_usd.toFixed(2)}
- Financing Net: $${cashflow.financing_net_usd.toFixed(2)}
`;

  // Format spending section
  const topCategories = Object.entries(spending.by_tag)
    .sort((a, b) => b[1].total_usd - a[1].total_usd)
    .slice(0, 5)
    .map(
      ([tag, data]) =>
        `  - ${tag}: $${data.total_usd.toFixed(2)} (${data.percentage.toFixed(1)}%)`,
    )
    .join("\n");

  const spendingSection = `
SPENDING BY CATEGORY
- Total Spending: $${spending.total_usd.toFixed(2)}
- Current Month: $${spending.current_month_usd.toFixed(2)}
- Last Month: $${spending.last_month_usd.toFixed(2)}
- Average Daily: $${spending.avg_daily_usd.toFixed(2)}
- Available Balance: $${spending.available_balance_usd.toFixed(2)}

Top Categories:
${topCategories || "  No spending data available"}
`;

  // Calculate total monthly debt payments (converting to USD based on asset currency)
  const totalMonthlyUSD = borrowings.reduce((sum, b) => {
    const payment = Math.abs(b.monthlyPayment || 0);
    return sum + toUSD(payment, b.asset.symbol, vndToUsdRate);
  }, 0);

  // Format borrowings section
  let borrowingsSection = "\nBORROWINGS / DEBT\n";

  if (borrowings.length === 0) {
    borrowingsSection += "- No active borrowings\n";
  } else {
    const totalDebtUSD = borrowings.reduce((sum, b) => {
      const outstanding = Math.abs(b.outstanding || 0);
      return sum + toUSD(outstanding, b.asset.symbol, vndToUsdRate);
    }, 0);

    // Calculate DTI using user-provided monthly income
    const debtToIncomeRatio = monthlyIncome > 0
      ? (totalMonthlyUSD / monthlyIncome) * 100
      : 0;

    borrowingsSection += `- Total Debt: $${totalDebtUSD.toFixed(2)}\n`;
    borrowingsSection += `- Total Monthly Payments: $${totalMonthlyUSD.toFixed(2)}\n`;
    borrowingsSection += `- Monthly Income: $${monthlyIncome.toFixed(2)}\n`;
    borrowingsSection += `- Debt-to-Income Ratio: ${debtToIncomeRatio.toFixed(1)}%\n`;
    borrowingsSection += `- Number of Active Loans: ${borrowings.length}\n\n`;

    borrowingsSection += "Individual Loans:\n";
    for (const b of borrowings) {
      const outstanding = Math.abs(b.outstanding || 0);
      const monthly = Math.abs(b.monthlyPayment || 0);
      borrowingsSection += `  - ${b.counterparty}: $${outstanding.toFixed(2)} outstanding, $${monthly.toFixed(2)}/month (${b.interestRate || "N/A"}% rate)\n`;
    }
  }

  // Format vaults section for performance comparison
  let vaultsSection = "\nPORTFOLIO / VAULT PERFORMANCE\n";
  if (vaults.length === 0) {
    vaultsSection += "- No vault data available\n";
  } else {
    const totalAum = vaults.reduce((sum, v) => sum + v.aum_usd, 0);
    const totalPnl = vaults.reduce((sum, v) => sum + v.pnl_usd, 0);
    const avgRoi = totalAum > 0 ? (totalPnl / totalAum) * 100 : 0;
    const avgApr = vaults.reduce((sum, v) => sum + v.apr_percent, 0) / vaults.length;

    vaultsSection += `- Total AUM: $${totalAum.toFixed(2)}\n`;
    vaultsSection += `- Total PnL: $${totalPnl.toFixed(2)}\n`;
    vaultsSection += `- Average ROI: ${avgRoi.toFixed(2)}%\n`;
    vaultsSection += `- Average APR: ${avgApr.toFixed(2)}%\n`;
    vaultsSection += `- Number of Vaults: ${vaults.length}\n\n`;

    vaultsSection += "Individual Vaults:\n";
    for (const v of vaults) {
      vaultsSection += `  - ${v.vault}: AUM $${v.aum_usd.toFixed(2)}, PnL $${v.pnl_usd.toFixed(2)} (${v.roi_percent.toFixed(2)}% ROI, ${v.apr_percent.toFixed(2)}% APR)\n`;
    }
  }

  return cashflowSection + spendingSection + borrowingsSection + vaultsSection;
}

/**
 * Parse Claude's JSON response
 */
function parseAnalysisResponse(content: string): FinancialAnalysis {
  // Try to extract JSON from markdown code blocks if present
  let jsonContent = content.trim();

  // Remove markdown code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonContent = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(jsonContent);

  // Validate and sanitize response structure
  return {
    generatedAt: new Date().toISOString(),
    cashFlowHealth: {
      score: parsed.cashFlowHealth?.score || "warning",
      summary: parsed.cashFlowHealth?.summary || "",
      insights: Array.isArray(parsed.cashFlowHealth?.insights)
        ? parsed.cashFlowHealth.insights
        : [],
    },
    borrowingAnalysis: {
      totalDebt: {
        vnd: parsed.borrowingAnalysis?.totalDebt?.vnd || 0,
        usd: parsed.borrowingAnalysis?.totalDebt?.usd || 0,
      },
      monthlyPayments: {
        vnd: parsed.borrowingAnalysis?.monthlyPayments?.vnd || 0,
        usd: parsed.borrowingAnalysis?.monthlyPayments?.usd || 0,
      },
      debtToIncomeRatio: parsed.borrowingAnalysis?.debtToIncomeRatio || 0,
      insights: Array.isArray(parsed.borrowingAnalysis?.insights)
        ? parsed.borrowingAnalysis.insights
        : [],
    },
    spendingPatterns: {
      topCategories: Array.isArray(parsed.spendingPatterns?.topCategories)
        ? parsed.spendingPatterns.topCategories
        : [],
      unusualSpending: Array.isArray(parsed.spendingPatterns?.unusualSpending)
        ? parsed.spendingPatterns.unusualSpending
        : [],
      insights: Array.isArray(parsed.spendingPatterns?.insights)
        ? parsed.spendingPatterns.insights
        : [],
    },
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((rec: any) => ({
          priority: rec.priority || "medium",
          category: rec.category || "spending",
          title: rec.title || "",
          description: rec.description || "",
        }))
      : [],
  };
}

/**
 * Fetch financial data from backend APIs
 */
async function fetchFinancialData(correlationId?: string): Promise<{
  cashflow: CashflowResponse;
  spending: SpendingResponse;
  borrowings: Borrowing[];
  vaults: VaultSummary[];
  vndToUsdRate: number;
}> {
  const correlationLogger = createCorrelationLogger(correlationId);
  const cfg = loadConfig();

  // Fetch data in parallel (including FX rate for VND conversion)
  const [cashflowRes, spendingRes, borrowingsRes, vaultsRes, fxRes] = await Promise.all([
    fetch(`${cfg.BACKEND_BASE_URL}/reports/cashflow`, {
      signal: AbortSignal.timeout(30000),
    }),
    fetch(`${cfg.BACKEND_BASE_URL}/reports/spending`, {
      signal: AbortSignal.timeout(30000),
    }),
    fetch(`${cfg.BACKEND_BASE_URL}/borrowings`, {
      signal: AbortSignal.timeout(30000),
    }),
    fetch(`${cfg.BACKEND_BASE_URL}/reports/vaults/summary`, {
      signal: AbortSignal.timeout(30000),
    }),
    fetch(`${cfg.BACKEND_BASE_URL}/fx/today?from=VND&to=USD`, {
      signal: AbortSignal.timeout(10000),
    }),
  ]);

  // Check responses
  if (!cashflowRes.ok) {
    throw new Error(`Cashflow API failed: ${cashflowRes.status}`);
  }
  if (!spendingRes.ok) {
    throw new Error(`Spending API failed: ${spendingRes.status}`);
  }
  if (!borrowingsRes.ok) {
    throw new Error(`Borrowings API failed: ${borrowingsRes.status}`);
  }

  const cashflow = (await cashflowRes.json()) as CashflowResponse;
  const spending = (await spendingRes.json()) as SpendingResponse;
  const borrowings = (await borrowingsRes.json()) as Borrowing[];

  // Vault data is optional - continue even if it fails
  let vaults: VaultSummary[] = [];
  if (vaultsRes.ok) {
    try {
      const vaultsData = await vaultsRes.json();
      vaults = vaultsData.rows || [];
    } catch (e) {
      correlationLogger.warn({ err: e }, "Failed to parse vaults data, continuing without it");
    }
  } else {
    correlationLogger.warn({ status: vaultsRes.status }, "Vaults API failed, continuing without vault data");
  }

  // Parse VND to USD rate (default to approximate rate if fetch fails)
  let vndToUsdRate = 1 / 23350; // Fallback ~0.0000428
  if (fxRes.ok) {
    try {
      const fxData = await fxRes.json();
      vndToUsdRate = fxData.rate || vndToUsdRate;
      correlationLogger.info({ vndToUsdRate }, "Fetched VND to USD exchange rate");
    } catch (e) {
      correlationLogger.warn({ err: e }, "Failed to parse FX rate, using fallback");
    }
  } else {
    correlationLogger.warn({ status: fxRes.status }, "FX API failed, using fallback VND rate");
  }

  correlationLogger.info(
    {
      cashflowNet: cashflow.combined_net_usd,
      spendingTotal: spending.total_usd,
      borrowingCount: borrowings.length,
      vaultCount: vaults.length,
      vndToUsdRate,
    },
    "Fetched financial data for analysis",
  );

  return { cashflow, spending, borrowings, vaults, vndToUsdRate };
}

/**
 * Generate AI-powered financial analysis
 * @param correlationId Optional correlation ID for logging
 * @param monthlyIncome User-provided monthly income in USD for accurate DTI calculation
 */
export async function generateAnalysis(
  correlationId?: string,
  monthlyIncome?: number,
): Promise<FinancialAnalysis> {
  const correlationLogger = createCorrelationLogger(correlationId);

  correlationLogger.info(
    { monthlyIncome, monthlyIncomeType: typeof monthlyIncome },
    "Starting AI advisor analysis generation",
  );

  try {
    // 1. Fetch data from backend
    const data = await fetchFinancialData(correlationId);

    // 2. Build prompt with monthly income
    const finalMonthlyIncome = monthlyIncome || 0;

    // Calculate total monthly payments in USD for logging
    const totalMonthlyPaymentsRaw = data.borrowings.reduce((sum, b) => sum + Math.abs(b.monthlyPayment || 0), 0);
    const totalMonthlyPaymentsUSD = data.borrowings.reduce((sum, b) => {
      const payment = Math.abs(b.monthlyPayment || 0);
      return sum + toUSD(payment, b.asset.symbol, data.vndToUsdRate);
    }, 0);

    correlationLogger.info(
      {
        monthlyIncome,
        finalMonthlyIncome,
        totalBorrowings: data.borrowings.length,
        totalMonthlyPaymentsRaw,
        totalMonthlyPaymentsUSD,
        vndToUsdRate: data.vndToUsdRate,
      },
      "Building analysis prompt with financial data",
    );
    
    const prompt = buildAnalysisPrompt({
      ...data,
      monthlyIncome: finalMonthlyIncome,
    });

    // Log the prompt for debugging (be careful with sensitive data)
    correlationLogger.debug(
      { promptLength: prompt.length, promptPreview: prompt.substring(0, 500) },
      "Generated analysis prompt",
    );

    // 3. Call Claude via LLMClient
    const llm = new LLMClient(
      { provider: "anthropic" },
      correlationId,
    );
    const response = await llm.chat(
      [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      { maxTokens: 4000, temperature: 0.3 },
    );

    correlationLogger.debug(
      { llmResponse: response.content },
      "LLM response received",
    );

    // 4. Parse JSON response
    const analysis = parseAnalysisResponse(response.content);

    correlationLogger.info(
      {
        cashFlowScore: analysis.cashFlowHealth.score,
        debtToIncomeRatio: analysis.borrowingAnalysis.debtToIncomeRatio,
        recommendationsCount: analysis.recommendations.length,
      },
      "Successfully generated AI advisor analysis",
    );

    return analysis;
  } catch (error: any) {
    correlationLogger.error(
      { err: error },
      "Failed to generate AI advisor analysis",
    );
    throw error;
  }
}

/**
 * Generate analysis with VND rate conversion
 */
export async function generateAnalysisWithRates(
  vndRate: number,
  correlationId?: string,
  monthlyIncome?: number,
): Promise<FinancialAnalysis> {
  const analysis = await generateAnalysis(correlationId, monthlyIncome);

  // Convert USD values to VND in the response
  analysis.borrowingAnalysis.totalDebt.vnd =
    analysis.borrowingAnalysis.totalDebt.usd * vndRate;
  analysis.borrowingAnalysis.monthlyPayments.vnd =
    analysis.borrowingAnalysis.monthlyPayments.usd * vndRate;

  return analysis;
}
