import pLimit from "p-limit";
import { LLMClient } from "../integrations/llm.js";
import {
  BankTransaction,
  BankStatementConfig,
  convertDateFormat,
  getTransactionType,
  getTransactionAmount,
  TransactionCategory,
} from "./excelParser.js";
import { TagRef } from "./schemas.js";
import { createCorrelationLogger } from "../utils/logger.js";

export interface ClassifiedTransaction {
  date: string; // "2025-11-29" (ISO format)
  type: TransactionCategory; // "INCOME" | "EXPENSE" | "CARD_PAYMENT"
  amount_vnd: number; // 52000
  counterparty: string; // Clean merchant/person name
  category?: string; // Category from tags list
  note: string; // Description/summary
  source_ref: string; // Transaction reference number
  confidence: number; // 0.0 - 1.0
  original: BankTransaction; // Original raw data
}

/**
 * Classify multiple bank transactions in a single LLM call
 */
export async function classifyBankTransactionsBatch(
  llmClient: LLMClient,
  transactions: BankTransaction[],
  config: BankStatementConfig,
  tags: TagRef[],
  correlationId?: string,
): Promise<ClassifiedTransaction[]> {
  const logger = createCorrelationLogger(correlationId);

  if (transactions.length === 0) return [];

  const availableTags = tags.map((t) => t.name).join(", ");

  const systemPrompt = `You are a financial transaction analyzer for Vietnamese bank statements.
Your task is to clean and categorize transaction information.
Output ONLY a JSON array with no additional text or markdown.`;

  // Build transaction list for the prompt
  const txList = transactions
    .map((tx, idx) => {
      const txType = getTransactionType(tx, config.statementType);
      const amount = getTransactionAmount(tx);
      let txDesc: string;
      if (txType === "EXPENSE") {
        txDesc = `Paid to: ${tx.remitter || "Unknown"}`;
      } else if (txType === "INCOME") {
        txDesc = `Received from: ${tx.remitter || "Unknown"}`;
      } else {
        txDesc = `Card payment/refund from: ${tx.remitter || "Unknown"}`;
      }
      return `[${idx}] Date: ${tx.date} | Type: ${txType} | ${txDesc} | Bank: ${tx.remitter_bank || "Unknown"} | Desc: ${tx.details || "N/A"} | Amount: ${amount.toLocaleString()} VND`;
    })
    .join("\n");

  const userPrompt = `Analyze these ${transactions.length} Vietnamese bank transactions and extract information:

${txList}

Available categories: ${availableTags || "None specified"}

Output a JSON array with ${transactions.length} objects in order (no markdown, just raw JSON):
[
  {"idx": 0, "counterparty": "cleaned name", "category": "matching category or null", "note": "brief English summary", "confidence": 0.9},
  ...
]

Rules:
- counterparty should be a clean, short name (e.g., "PVOIL HA NOI CHXD NGHIA TAN" -> "PVOIL Ha Noi")
- category must be from the available list or null
- note should be a brief English description (max 10 words)
- confidence is how sure you are (0.0-1.0)
- Output exactly ${transactions.length} items in order`;

  try {
    const response = await llmClient.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.2,
        maxTokens: 1500,
      },
    );

    // Parse AI response
    let aiResults: any[] = [];
    try {
      const content = response.content.trim();
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      aiResults = JSON.parse(jsonStr);
    } catch (parseError) {
      logger.warn(
        {
          error: parseError,
          response: response.content.substring(0, 300),
        },
        "Failed to parse AI batch response, using defaults",
      );
      aiResults = [];
    }

    // Map results back to transactions
    return transactions.map((tx, idx) => {
      const txType = getTransactionType(tx, config.statementType);
      const amount_vnd = getTransactionAmount(tx);
      const aiData =
        aiResults.find((r) => r.idx === idx) || aiResults[idx] || {};

      return {
        date: convertDateFormat(tx.date),
        type: txType,
        amount_vnd,
        counterparty: aiData.counterparty || tx.remitter || "Unknown",
        category: aiData.category || undefined,
        note: aiData.note || tx.details || "",
        source_ref: tx.transaction_no,
        confidence: aiData.confidence ?? 0.7,
        original: tx,
      };
    });
  } catch (error: any) {
    logger.error(
      { error: error.message },
      "AI batch classification failed, using basic classification",
    );

    // Fallback to basic classification
    return transactions.map((tx) => {
      const txType = getTransactionType(tx, config.statementType);
      return {
        date: convertDateFormat(tx.date),
        type: txType,
        amount_vnd: getTransactionAmount(tx),
        counterparty: tx.remitter || "Unknown",
        category: undefined,
        note: tx.details || "",
        source_ref: tx.transaction_no,
        confidence: 0.3,
        original: tx,
      };
    });
  }
}

/**
 * Classify a batch of transactions
 * Processes in parallel batches for efficiency
 */
export async function classifyBatch(
  llmClient: LLMClient,
  transactions: BankTransaction[],
  config: BankStatementConfig,
  tags: TagRef[],
  options: {
    batchSize?: number;
    skipAI?: boolean;
    maxConcurrency?: number;
  } = {},
  correlationId?: string,
): Promise<ClassifiedTransaction[]> {
  const logger = createCorrelationLogger(correlationId);
  const batchSize = options.batchSize ?? 5;
  const skipAI = options.skipAI ?? false;
  const maxConcurrency = options.maxConcurrency ?? 2;

  logger.info(
    {
      total: transactions.length,
      batchSize,
      skipAI,
      maxConcurrency,
      statementType: config.statementType,
    },
    "Starting batch classification",
  );

  const results: ClassifiedTransaction[] = [];

  if (skipAI) {
    // Fast mode: basic classification without AI
    for (const tx of transactions) {
      const txType = getTransactionType(tx, config.statementType);
      results.push({
        date: convertDateFormat(tx.date),
        type: txType,
        amount_vnd: getTransactionAmount(tx),
        counterparty: tx.remitter || "Unknown",
        category: undefined,
        note: tx.details || "",
        source_ref: tx.transaction_no,
        confidence: 0.5,
        original: tx,
      });
    }
    logger.info(
      { count: results.length },
      "Completed basic classification (no AI)",
    );
    return results;
  }

  // Split transactions into batches
  const batches: BankTransaction[][] = [];
  for (let i = 0; i < transactions.length; i += batchSize) {
    batches.push(transactions.slice(i, i + batchSize));
  }

  // Process batches with p-limit concurrency control
  const limit = pLimit(maxConcurrency);
  let processedCount = 0;

  const batchPromises = batches.map((batch, idx) =>
    limit(async () => {
      const batchResults = await classifyBankTransactionsBatch(
        llmClient,
        batch,
        config,
        tags,
        correlationId,
      );
      processedCount += batchResults.length;
      logger.info(
        {
          processed: processedCount,
          total: transactions.length,
          batch: idx + 1,
          totalBatches: batches.length,
        },
        "Batch classification progress",
      );

      // Delay after each batch to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return batchResults;
    }),
  );

  const batchResultsArray = await Promise.all(batchPromises);
  for (const batchResults of batchResultsArray) {
    results.push(...batchResults);
  }

  logger.info({ count: results.length }, "Completed AI classification");
  return results;
}

/**
 * Get summary statistics for classified transactions
 */
export function getClassificationSummary(
  transactions: ClassifiedTransaction[],
): {
  total: number;
  expenses: number;
  income: number;
  cardPayments: number;
  totalExpenseVND: number;
  totalIncomeVND: number;
  avgConfidence: number;
  byCategory: Record<string, number>;
} {
  const expenses = transactions.filter((t) => t.type === "EXPENSE");
  const income = transactions.filter((t) => t.type === "INCOME");
  const cardPayments = transactions.filter((t) => t.type === "CARD_PAYMENT");

  const byCategory: Record<string, number> = {};
  for (const tx of transactions) {
    const cat = tx.category || "uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  const totalConfidence = transactions.reduce(
    (sum, t) => sum + t.confidence,
    0,
  );

  return {
    total: transactions.length,
    expenses: expenses.length,
    income: income.length,
    cardPayments: cardPayments.length,
    totalExpenseVND: expenses.reduce((sum, t) => sum + t.amount_vnd, 0),
    totalIncomeVND: income.reduce((sum, t) => sum + t.amount_vnd, 0),
    avgConfidence:
      transactions.length > 0 ? totalConfidence / transactions.length : 0,
    byCategory,
  };
}
