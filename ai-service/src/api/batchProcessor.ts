import { v4 as uuidv4 } from "uuid";
import {
  parseExcelBankStatement,
  BankStatementConfig,
  TECHCOMBANK_DEBIT_CONFIG,
  TECHCOMBANK_CREDIT_CONFIG,
} from "../core/excelParser.js";
import {
  classifyBatch,
  ClassifiedTransaction,
  getClassificationSummary,
} from "../core/bankStatementClassifier.js";
import {
  createPendingAction,
  getTags,
  recordExpenseVND,
  recordIncomeVND,
  recordCreditExpenseVND,
  recordCardPaymentVND,
  SimpleTransactionResult,
} from "./backendClient.js";
import { LLMClient } from "../integrations/llm.js";
import { AppConfig, loadConfig } from "../utils/config.js";
import { createCorrelationLogger } from "../utils/logger.js";
import { ActionRequest, PendingActionCreate } from "../core/schemas.js";

export interface BatchProcessResult {
  batchId: string;
  filePath: string;
  bank: string;
  statementType: "DEBIT_ACCOUNT" | "CREDIT_CARD";
  totalTransactions: number;
  processedCount: number;
  failedCount: number;
  pendingActionIds: string[];
  errors: Array<{ index: number; error: string; transaction?: any }>;
  summary: {
    expenses: number;
    income: number;
    cardPayments: number;
    totalExpenseVND: number;
    totalIncomeVND: number;
    avgConfidence: number;
  };
}

export interface BatchProcessOptions {
  config?: AppConfig;
  skipAI?: boolean;
  batchSize?: number;
  defaultSpendingAccount?: string;
  defaultIncomeAccount?: string;
  dryRun?: boolean;
  /** If true, record transactions directly instead of creating pending actions */
  directRecord?: boolean;
}

/**
 * Process a bank statement Excel file and create pending actions
 */
export async function processBankStatementFile(
  filePath: string,
  bankConfig: BankStatementConfig,
  options: BatchProcessOptions = {},
  correlationId?: string,
): Promise<BatchProcessResult> {
  const logger = createCorrelationLogger(correlationId);
  const config = options.config ?? loadConfig();
  const batchId = `bank_${bankConfig.bank}_${Date.now()}`;

  logger.info(
    {
      filePath,
      batchId,
      bank: bankConfig.bank,
      statementType: bankConfig.statementType,
      skipAI: options.skipAI,
      dryRun: options.dryRun,
    },
    "Starting bank statement processing",
  );

  // Step 1: Parse Excel file
  const transactions = parseExcelBankStatement(
    filePath,
    bankConfig,
    correlationId,
  );
  logger.info({ count: transactions.length }, "Parsed transactions from Excel");

  if (transactions.length === 0) {
    return {
      batchId,
      filePath,
      bank: bankConfig.bank,
      statementType: bankConfig.statementType,
      totalTransactions: 0,
      processedCount: 0,
      failedCount: 0,
      pendingActionIds: [],
      errors: [],
      summary: {
        expenses: 0,
        income: 0,
        cardPayments: 0,
        totalExpenseVND: 0,
        totalIncomeVND: 0,
        avgConfidence: 0,
      },
    };
  }

  // Step 2: Get tags for categorization (no longer fetching accounts - backend uses vault defaults)
  let tags: { name: string }[] = [];

  try {
    tags = await getTags(config, correlationId);
    logger.info(
      {
        tags: tags.length,
      },
      "Fetched tags for categorization",
    );
  } catch (error: any) {
    logger.warn(
      { error: error.message },
      "Failed to fetch tags, continuing without categorization",
    );
  }

  // Step 3: Classify transactions with AI
  const llmClient = new LLMClient({}, correlationId);
  const classified = await classifyBatch(
    llmClient,
    transactions,
    bankConfig,
    tags,
    {
      batchSize: options.batchSize ?? 5,
      skipAI: options.skipAI ?? false,
    },
    correlationId,
  );

  logger.info({ count: classified.length }, "Classified transactions");

  // Get summary
  const summaryStats = getClassificationSummary(classified);

  // Step 4: Process transactions (direct record or pending actions)
  const processedIds: string[] = [];
  const errors: Array<{ index: number; error: string; transaction?: any }> = [];

  for (let i = 0; i < classified.length; i++) {
    const ct = classified[i];

    try {
      if (options.dryRun) {
        // Dry run - just generate a fake ID
        processedIds.push(`dry-run-${uuidv4()}`);
        logger.debug(
          { index: i, type: ct.type },
          "Dry run: would process transaction",
        );
        continue;
      }

      if (options.directRecord) {
        // Direct recording - AI doesn't need to know vault names
        let result: SimpleTransactionResult;

        switch (ct.type) {
          case "EXPENSE":
            if (bankConfig.statementType === "CREDIT_CARD") {
              result = await recordCreditExpenseVND(
                config,
                {
                  vnd_amount: ct.amount_vnd,
                  date: ct.date,
                  counterparty: ct.counterparty || undefined,
                  tag: ct.category || undefined,
                  note: ct.note || undefined,
                  source_ref: ct.source_ref,
                },
                correlationId,
              );
            } else {
              result = await recordExpenseVND(
                config,
                {
                  vnd_amount: ct.amount_vnd,
                  date: ct.date,
                  counterparty: ct.counterparty || undefined,
                  tag: ct.category || undefined,
                  note: ct.note || undefined,
                  source_ref: ct.source_ref,
                },
                correlationId,
              );
            }
            break;
          case "INCOME":
            result = await recordIncomeVND(
              config,
              {
                vnd_amount: ct.amount_vnd,
                date: ct.date,
                counterparty: ct.counterparty || undefined,
                tag: ct.category || undefined,
                note: ct.note || undefined,
                source_ref: ct.source_ref,
              },
              correlationId,
            );
            break;
          case "CARD_PAYMENT":
            result = await recordCardPaymentVND(
              config,
              {
                vnd_amount: ct.amount_vnd,
                date: ct.date,
                note: ct.note || undefined,
                source_ref: ct.source_ref,
              },
              correlationId,
            );
            break;
          default:
            result = await recordExpenseVND(
              config,
              {
                vnd_amount: ct.amount_vnd,
                date: ct.date,
                counterparty: ct.counterparty || undefined,
                tag: ct.category || undefined,
                note: ct.note || undefined,
                source_ref: ct.source_ref,
              },
              correlationId,
            );
        }

        processedIds.push(result.transaction_id);
        logger.debug(
          {
            id: result.transaction_id,
            type: ct.type,
            account: result.account_used,
          },
          "Recorded transaction directly",
        );
      } else {
        // Pending action mode - still simplified (no account needed in action_json)
        const actionJson: ActionRequest = {
          action:
            ct.type === "INCOME"
              ? "income_vnd"
              : ct.type === "CARD_PAYMENT"
                ? "card_payment_vnd"
                : bankConfig.statementType === "CREDIT_CARD"
                  ? "credit_spend_vnd"
                  : "spend_vnd",
          params: {
            account: "", // Backend will use defaults
            vnd_amount: ct.amount_vnd,
            date: ct.date,
            counterparty: ct.counterparty || null,
            tag: ct.category || null,
            note: ct.note || null,
          },
        };

        const payload: PendingActionCreate = {
          source: "bank_statement_excel",
          raw_input: JSON.stringify(ct.original),
          toon_text: JSON.stringify({
            date: ct.date,
            type: ct.type,
            amount_vnd: ct.amount_vnd,
            counterparty: ct.counterparty,
            category: ct.category,
            note: ct.note,
          }),
          action_json: actionJson,
          confidence: ct.confidence,
          batch_id: batchId,
          meta: {
            bank: bankConfig.bank,
            statement_type: bankConfig.statementType,
            transaction_ref: ct.source_ref,
            transaction_type: ct.type,
            index_in_file: i,
          },
        };

        const result = await createPendingAction(
          config,
          payload,
          correlationId,
        );
        processedIds.push(result.id);
        logger.debug(
          { id: result.id, type: ct.type },
          "Created pending action",
        );
      }
    } catch (error: any) {
      logger.error(
        { error: error.message, index: i },
        "Failed to process transaction",
      );
      errors.push({
        index: i,
        error: error.message,
        transaction: ct.original,
      });
    }
  }

  const result: BatchProcessResult = {
    batchId,
    filePath,
    bank: bankConfig.bank,
    statementType: bankConfig.statementType,
    totalTransactions: transactions.length,
    processedCount: processedIds.length,
    failedCount: errors.length,
    pendingActionIds: processedIds, // Contains transaction IDs if directRecord, otherwise pending action IDs
    errors,
    summary: {
      expenses: summaryStats.expenses,
      income: summaryStats.income,
      cardPayments: summaryStats.cardPayments,
      totalExpenseVND: summaryStats.totalExpenseVND,
      totalIncomeVND: summaryStats.totalIncomeVND,
      avgConfidence: summaryStats.avgConfidence,
    },
  };

  logger.info(
    {
      batchId,
      processed: result.processedCount,
      failed: result.failedCount,
      expenses: result.summary.expenses,
      income: result.summary.income,
    },
    "Batch processing completed",
  );

  return result;
}

/**
 * Get bank config by name
 */
export function getBankConfig(bankName: string): BankStatementConfig {
  const configs: Record<string, BankStatementConfig> = {
    techcombank: TECHCOMBANK_DEBIT_CONFIG,
    techcombank_debit: TECHCOMBANK_DEBIT_CONFIG,
    techcombank_credit: TECHCOMBANK_CREDIT_CONFIG,
  };

  const config = configs[bankName.toLowerCase()];
  if (!config) {
    throw new Error(
      `Unknown bank: ${bankName}. Available: ${Object.keys(configs).join(", ")}`,
    );
  }

  return config;
}

/**
 * Format batch result for display
 */
export function formatBatchResult(result: BatchProcessResult): string {
  const lines: string[] = [
    "=".repeat(50),
    `Bank Statement Processing Complete`,
    "=".repeat(50),
    ``,
    `Batch ID: ${result.batchId}`,
    `File: ${result.filePath}`,
    `Bank: ${result.bank}`,
    `Statement Type: ${result.statementType}`,
    ``,
    `--- Summary ---`,
    `Total Transactions: ${result.totalTransactions}`,
    `Processed: ${result.processedCount}`,
    `Failed: ${result.failedCount}`,
    ``,
    `--- Breakdown ---`,
    `Expenses: ${result.summary.expenses} (${result.summary.totalExpenseVND.toLocaleString()} VND)`,
    `Income: ${result.summary.income} (${result.summary.totalIncomeVND.toLocaleString()} VND)`,
    `Card Payments: ${result.summary.cardPayments}`,
    `Avg Confidence: ${(result.summary.avgConfidence * 100).toFixed(1)}%`,
    ``,
  ];

  if (result.errors.length > 0) {
    lines.push(`--- Errors (${result.errors.length}) ---`);
    for (const err of result.errors.slice(0, 5)) {
      lines.push(`  [${err.index}] ${err.error}`);
    }
    if (result.errors.length > 5) {
      lines.push(`  ... and ${result.errors.length - 5} more`);
    }
    lines.push(``);
  }

  lines.push(`--- Next Steps ---`);
  lines.push(`Review pending actions at:`);
  lines.push(`GET /admin/pending-actions?batch_id=${result.batchId}`);
  lines.push(``);
  lines.push("=".repeat(50));

  return lines.join("\n");
}
