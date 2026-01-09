import { Telegraf, Context } from "telegraf";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LLMClient } from "./llm.js";
import { AppConfig } from "../utils/config.js";
import { logger, createCorrelationLogger } from "../utils/logger.js";
import { createPendingAction, redact } from "../api/backendClient.js";
import { parseExpenseText, parseTopicMessages } from "../core/parser.js";
import { parseBankScreenshot } from "./vision.js";
import { PendingActionCreate, ActionRequest } from "../core/schemas.js";
import { handleAndLogError, ErrorCategory } from "../utils/errors.js";
import {
    processBankStatementFile,
    getBankConfig,
    formatBatchResult,
} from "../api/batchProcessor.js";
import {
    getLastProcessedMessageId,
    setLastProcessedMessageId,
} from "../utils/topicState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Ctx = Context & { state: Record<string, unknown> };

interface PendingBatchItem {
    id: string;
    messageId: number;
    text: string;
    payload: PendingActionCreate;
    parsedAction?: ActionRequest;
    status: "pending" | "approved" | "rejected";
}

interface SessionState {
    awaitingAccountForBatch?: string;
    pendingReview?: {
        payload: PendingActionCreate;
        correlationId: string;
        parsedAction: any;
    };
    pendingBatch?: {
        items: PendingBatchItem[];
        correlationId: string;
        chatId: number;
        topicId: number;
        displayMessageId?: number;
    };
}

const sessionStore = new Map<number, SessionState>();

// Generate a unique ID for the review session
function generateReviewId(): string {
    return `review_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Format the preview message
function formatPreviewMessage(action: any, rawInput: string): string {
    const lines = [
        "📋 *Pending Action Review*",
        "",
        "I parsed the following action from your message:",
        "",
    ];

    if (action) {
        const params = action.params;
        lines.push("*Action:* `" + action.action + "`");
        lines.push(
            "*Amount:* `" + params.vnd_amount.toLocaleString() + " VND`"
        );
        lines.push("*Date:* `" + params.date + "`");
        if (params.counterparty) {
            lines.push("*Counterparty:* `" + params.counterparty + "`");
        }
        if (params.tag) {
            lines.push("*Tag:* `" + params.tag + "`");
        }
        if (params.note) {
            lines.push("*Note:* `" + params.note + "`");
        }
    }

    lines.push("");
    lines.push("*Original message:*");
    lines.push('"' + rawInput + '"');
    lines.push("");
    lines.push("Please review and approve, or provide corrections.");

    return lines.join("\n");
}

// Format a single batch item for display
function formatBatchItemMessage(item: PendingBatchItem, index: number): string {
    const lines: string[] = [];
    const statusText =
        item.status === "approved"
            ? "[APPROVED]"
            : item.status === "rejected"
              ? "[REJECTED]"
              : "[PENDING]";

    lines.push(`${statusText} *#${index + 1}*`);

    if (item.parsedAction) {
        const params = item.parsedAction.params;
        lines.push(`  Amount: ${params.vnd_amount.toLocaleString()} VND`);
        lines.push(`  Date: ${params.date}`);
        if (params.counterparty) {
            lines.push(`  Counterparty: ${params.counterparty}`);
        }
        if (params.tag) {
            lines.push(`  Tag: ${params.tag}`);
        }
    } else {
        lines.push(`  [Could not parse]`);
    }
    lines.push(`  Raw: "${item.text.substring(0, 50)}${item.text.length > 50 ? "..." : ""}"`);

    return lines.join("\n");
}

// Format the batch preview message showing all items
function formatBatchPreviewMessage(items: PendingBatchItem[]): string {
    const lines: string[] = [
        "📋 *Topic Messages to Review*",
        "",
        `Found ${items.length} message(s) to process:`,
        "",
    ];

    items.forEach((item, index) => {
        lines.push(formatBatchItemMessage(item, index));
        lines.push("");
    });

    const pendingCount = items.filter((i) => i.status === "pending").length;
    const approvedCount = items.filter((i) => i.status === "approved").length;
    const rejectedCount = items.filter((i) => i.status === "rejected").length;

    lines.push("---");
    lines.push(
        `Pending: ${pendingCount} | Approved: ${approvedCount} | Rejected: ${rejectedCount}`
    );

    if (pendingCount > 0) {
        lines.push("");
        lines.push("Use buttons below to approve/reject each item.");
    }

    return lines.join("\n");
}

// Generate inline keyboard for batch approval
function generateBatchKeyboard(items: PendingBatchItem[]): any {
    const rows: any[][] = [];

    // Create approve/reject buttons for each pending item
    items.forEach((item, index) => {
        if (item.status === "pending") {
            rows.push([
                {
                    text: `✅ #${index + 1}`,
                    callback_data: `batch_approve_${item.id}`,
                },
                {
                    text: `❌ #${index + 1}`,
                    callback_data: `batch_reject_${item.id}`,
                },
            ]);
        }
    });

    // Add action buttons at the bottom
    const pendingItems = items.filter((i) => i.status === "pending");
    if (pendingItems.length > 0) {
        rows.push([
            { text: "✅ Approve All", callback_data: "batch_approve_all" },
            { text: "❌ Reject All", callback_data: "batch_reject_all" },
        ]);
    }

    rows.push([{ text: "💾 Save & Finish", callback_data: "batch_finish" }]);

    return { inline_keyboard: rows };
}

export function buildBot(cfg: AppConfig, openai: OpenAI) {
    const bot = new Telegraf<Ctx>(cfg.TELEGRAM_BOT_TOKEN);

    bot.telegram
        .setMyCommands([
            {
                command: "start",
                description: "Show how to send expenses or bank screenshots",
            },
            {
                command: "statement",
                description: "How to upload bank statement Excel files",
            },
            {
                command: "sync",
                description: "Sync and process unread messages from this topic",
            },
        ])
        .catch((err) => {
            logger.warn({ err }, "Failed to register Telegram bot commands");
        });

    bot.use(async (ctx, next) => {
        const chatId = String(ctx.chat?.id || "");
        console.log("chatId", chatId);
        if (!cfg.allowedChatIds.has(chatId)) {
            return;
        }
        ctx.state = ctx.state || {};
        await next();
    });

    // /statement command - show how to upload bank statements
    bot.command("statement", async (ctx) => {
        const helpText = [
            "📊 *Bank Statement Upload*",
            "",
            "*How to use:*",
            "1. Send an Excel file (.xlsx) from your bank",
            "2. Transactions will be parsed and classified",
            "3. Review pending actions in web UI",
            "",
            "*Caption options:*",
            "• `fast` - Skip AI classification (faster)",
            "• `credit` or `cc` - Credit card statement",
            "",
            "*Supported banks:*",
            "• Techcombank (debit & credit)",
            "",
            "*Examples:*",
            "• Send file with no caption → AI classification",
            '• Send file with caption "fast" → Quick mode',
            '• Send file with caption "credit" → Credit card',
        ].join("\n");

        await ctx.reply(helpText, { parse_mode: "Markdown" });
    });

    // /sync command - process unread messages from topic
    bot.command("sync", async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId) return;

        const topicId = ctx.message?.message_thread_id;
        if (!topicId) {
            await ctx.reply(
                "⚠️ This command must be used in a topic/thread, not the main chat."
            );
            return;
        }

        if (!cfg.allowedTopicIds.has(String(topicId))) {
            await ctx.reply("⚠️ This topic is not configured for syncing.");
            return;
        }

        const correlationId = `sync-${chatId}-${topicId}-${Date.now()}`;
        const correlationLogger = createCorrelationLogger(correlationId);

        correlationLogger.info(
            { chatId, topicId },
            "Starting topic sync"
        );

        const processingMsg = await ctx.reply("🔄 Syncing topic messages...", {
            message_thread_id: topicId,
        });

        try {
            // Get last processed message ID for this topic
            const lastProcessedId = getLastProcessedMessageId(chatId, topicId);

            correlationLogger.info(
                { lastProcessedId },
                "Last processed message ID"
            );

            // Collect messages from the topic that are newer than lastProcessedId
            // Note: Telegram Bot API doesn't have a direct "get messages from topic" endpoint
            // We'll need to track messages as they come in, or use a workaround
            // For now, we'll store messages in session and process them when /sync is called

            const state = sessionStore.get(chatId);
            if (!state?.pendingBatch || state.pendingBatch.items.length === 0) {
                await ctx.telegram.editMessageText(
                    chatId,
                    processingMsg.message_id,
                    undefined,
                    "ℹ️ No pending messages to process.\n\n" +
                        "Messages are collected as they arrive in this topic. " +
                        "Send expense messages first, then use /sync to review them."
                );
                return;
            }

            // Display the batch for approval
            const previewMsg = formatBatchPreviewMessage(state.pendingBatch.items);

            await ctx.telegram.editMessageText(
                chatId,
                processingMsg.message_id,
                undefined,
                previewMsg,
                {
                    parse_mode: "Markdown",
                    reply_markup: generateBatchKeyboard(state.pendingBatch.items),
                }
            );

            // Store the display message ID for later updates
            state.pendingBatch.displayMessageId = processingMsg.message_id;
            sessionStore.set(chatId, state);

            correlationLogger.info(
                { itemCount: state.pendingBatch.items.length },
                "Displayed batch for approval"
            );
        } catch (e: any) {
            correlationLogger.error({ error: e.message }, "Failed to sync topic");
            await ctx.telegram.editMessageText(
                chatId,
                processingMsg.message_id,
                undefined,
                "❌ Failed to sync: " + redact(e.message)
            );
        }
    });

    // Handle text messages
    bot.on("text", async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId) return;
        const threadId = ctx.message?.message_thread_id;
        if (threadId && !cfg.allowedTopicIds.has(String(threadId))) {
            logger.info(
                { chatId, threadId },
                "Ignoring message from unallowed topic ID"
            );
            return;
        }
        console.log("chatId", chatId);
        const text = ctx.message?.text || "";
        const correlationId = `text-${chatId}-${Date.now()}`;
        const correlationLogger = createCorrelationLogger(correlationId);
        const state = sessionStore.get(chatId) || {};

        correlationLogger.info(
            {
                chatId,
                textLength: text.length,
                textPreview: text.substring(0, 100),
            },
            "Processing text message"
        );

        // If waiting for account selection for a batch
        if (state.awaitingAccountForBatch) {
            const account = text.trim();
            correlationLogger.info(
                { requestedAccount: account },
                "Handling account selection for batch"
            );
            // No-op here; for v1 we ask user to resend the image with account in text
            await ctx.reply(
                `Got account: ${account}. Please resend the screenshot with this account in the caption for now.`
            );
            sessionStore.delete(chatId);
            return;
        }

        // If user is providing corrections to a pending review
        if (state.pendingReview) {
            correlationLogger.info(
                { chatId },
                "User providing corrections to pending review"
            );

            // Parse the correction as a new request
            try {
                const llmClient = new LLMClient(
                    {
                        provider: cfg.MODEL_PROVIDER,
                        timeout: 30000,
                    },
                    correlationId
                );

                // Use the original input + correction for context
                const correctionPrompt = `Original: "${state.pendingReview.payload.raw_input}"\n\nUser correction: "${text}"\n\nParse the corrected version.`;
                const parsed = await parseExpenseText(
                    llmClient,
                    correctionPrompt,
                    correlationId
                );

                if (!parsed.action) {
                    await ctx.reply(
                        "❌ Could not parse corrections. Please try again with clearer instructions."
                    );
                    return;
                }

                // Update the pending review with the new parsed action
                state.pendingReview.parsedAction = parsed.action;
                state.pendingReview.payload.action_json = parsed.action;
                state.pendingReview.payload.toon_text = parsed.toon;

                // Show updated preview
                const reviewId = generateReviewId();
                const previewMsg = formatPreviewMessage(
                    parsed.action,
                    state.pendingReview.payload.raw_input
                );

                await ctx.reply(previewMsg, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "✅ Approve",
                                    callback_data: `approve_${reviewId}`,
                                },
                                {
                                    text: "✏️ Edit",
                                    callback_data: `edit_${reviewId}`,
                                },
                            ],
                            [
                                {
                                    text: "❌ Cancel",
                                    callback_data: `cancel_${reviewId}`,
                                },
                            ],
                        ],
                    },
                });

                correlationLogger.info(
                    {
                        originalAction: state.pendingReview.parsedAction,
                        correctedAction: parsed.action,
                    },
                    "User corrections applied"
                );
                return;
            } catch (e: any) {
                await ctx.reply(
                    "❌ Failed to apply corrections: " + redact(e.message)
                );
                return;
            }
        }

        try {
            // LLM provider and credentials are resolved from env/config via LLMClient
            const llmClient = new LLMClient(
                {
                    provider: cfg.MODEL_PROVIDER,
                    timeout: 30000,
                },
                correlationId
            );

            // Parse expense text without grounding - backend handles account assignment via vault defaults
            const parsed = await parseExpenseText(
                llmClient,
                text,
                correlationId
            );

            if (!parsed.action) {
                await ctx.reply(
                    "❌ Could not parse your message. Please try again with a clearer format."
                );
                return;
            }

            const payload: PendingActionCreate = {
                source: "telegram_text",
                raw_input: text,
                toon_text: parsed.toon,
                action_json: parsed.action || undefined,
                confidence: parsed.confidence,
            };

            // If in a topic, add to batch queue instead of immediate approval
            if (threadId && cfg.allowedTopicIds.has(String(threadId))) {
                const messageId = ctx.message?.message_id || 0;
                const itemId = `item_${Date.now()}_${Math.random().toString(36).substring(7)}`;

                const batchItem: PendingBatchItem = {
                    id: itemId,
                    messageId,
                    text,
                    payload,
                    parsedAction: parsed.action,
                    status: "pending",
                };

                // Get or initialize the pending batch
                const existingState = sessionStore.get(chatId) || {};
                const pendingBatch = existingState.pendingBatch || {
                    items: [],
                    correlationId,
                    chatId,
                    topicId: threadId,
                };

                pendingBatch.items.push(batchItem);

                sessionStore.set(chatId, {
                    ...existingState,
                    pendingBatch,
                });

                correlationLogger.info(
                    {
                        itemId,
                        messageId,
                        batchSize: pendingBatch.items.length,
                        hasAction: !!parsed.action,
                        actionType: parsed.action?.action,
                    },
                    "Added message to batch queue"
                );

                // Send a brief confirmation
                await ctx.reply(
                    `📥 Added to queue (#${pendingBatch.items.length}). Use /sync to review all.`,
                    { message_thread_id: threadId }
                );
                return;
            }

            // Normal flow for non-topic messages: immediate approval
            // Store in session for review
            const reviewId = generateReviewId();
            sessionStore.set(chatId, {
                ...state,
                pendingReview: {
                    payload,
                    correlationId,
                    parsedAction: parsed.action,
                },
            });

            // Show preview with approve/edit buttons
            const previewMsg = formatPreviewMessage(parsed.action, text);

            await ctx.reply(previewMsg, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "✅ Approve",
                                callback_data: `approve_${reviewId}`,
                            },
                            {
                                text: "✏️ Edit",
                                callback_data: `edit_${reviewId}`,
                            },
                        ],
                        [
                            {
                                text: "❌ Cancel",
                                callback_data: `cancel_${reviewId}`,
                            },
                        ],
                    ],
                },
            });

            correlationLogger.info(
                {
                    reviewId,
                    hasAction: !!parsed.action,
                    actionType: parsed.action?.action,
                    account: parsed.action?.params.account,
                },
                "Showing preview for user review"
            );
        } catch (e: any) {
            const categorizedError = handleAndLogError(
                e,
                {
                    chatId,
                    textLength: text.length,
                    textPreview: text.substring(0, 100),
                },
                "parseText"
            );

            let userMessage = "Sorry, I couldn't parse that text.";

            if (categorizedError.category === ErrorCategory.AI_SERVICE) {
                userMessage +=
                    " The AI service is currently unavailable. Please try again later.";
            } else if (categorizedError.category === ErrorCategory.NETWORK) {
                userMessage +=
                    " Network error occurred. Please check your connection and try again.";
            } else if (categorizedError.category === ErrorCategory.VALIDATION) {
                userMessage +=
                    ' Please check the format and try again. Example: "Lunch 120k at McDo from Bank today"';
            } else {
                userMessage += ` ${redact(String(categorizedError.message))}`;
            }

            await ctx.reply(userMessage);
        }
    });

    // Handle photos with optional caption
    bot.on("photo", async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId) return;
        const photos = ctx.message?.photo;
        if (!photos || photos.length === 0) return;
        const best = photos[photos.length - 1];
        const correlationId = `photo-${chatId}-${Date.now()}`;
        const correlationLogger = createCorrelationLogger(correlationId);

        correlationLogger.info(
            {
                chatId,
                fileId: best.file_id,
                hasCaption: !!ctx.message?.caption,
                photoCount: photos.length,
            },
            "Processing photo message"
        );

        try {
            // Get file info from Telegram
            const file = await ctx.telegram.getFile(best.file_id);
            if (!file.file_path) {
                throw new Error("Telegram file path is missing");
            }
            const finalFileUrl = `https://api.telegram.org/file/bot${cfg.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
            correlationLogger.debug(
                { filePath: file.file_path },
                "Constructed file URL from Telegram"
            );

            const caption = ctx.message?.caption || "";
            correlationLogger.debug(
                { captionLength: caption.length },
                "Parsing bank screenshot"
            );

            // Text LLM for any caption/auxiliary parsing (provider resolved from env/config)
            const llmClient = new LLMClient(
                {
                    provider: cfg.MODEL_PROVIDER,
                    timeout: 60000,
                },
                correlationId
            );

            // For vision, we still need to use OpenAI directly for now
            const { toon, rows } = await parseBankScreenshot(
                openai,
                finalFileUrl,
                correlationId
            );

            correlationLogger.info(
                {
                    rowsFound: rows.length,
                    toonLength: toon.length,
                    caption: caption.substring(0, 100),
                },
                "Successfully parsed screenshot"
            );

            // For v1 we do not map into actions yet; store rows TOON as raw for review
            const payload: PendingActionCreate = {
                source: "telegram_image",
                raw_input: caption || "[image] bank screenshot",
                toon_text: toon,
                meta: {
                    telegram_file_id: best.file_id,
                    rows_count: rows.length,
                    file_size: best.file_size,
                    width: best.width,
                    height: best.height,
                },
            };

            const res = await createPendingAction(cfg, payload, correlationId);

            correlationLogger.info(
                {
                    pendingId: res.id,
                    rowsCount: rows.length,
                },
                "Successfully created pending action from screenshot"
            );

            const replyText = `📸 Screenshot parsed and queued (${rows.length} rows)\nPending ID: ${res.id}`;
            await ctx.reply(replyText);
        } catch (e: any) {
            const categorizedError = handleAndLogError(
                e,
                {
                    chatId,
                    fileId: best.file_id,
                    hasCaption: !!ctx.message?.caption,
                },
                "parsePhoto"
            );

            let userMessage = "Sorry, I couldn't parse the screenshot.";

            if (categorizedError.category === ErrorCategory.AI_SERVICE) {
                userMessage +=
                    " The AI service is currently unavailable. Please try again later.";
            } else if (categorizedError.category === ErrorCategory.NETWORK) {
                userMessage +=
                    " Network error occurred. Please check your connection and try again.";
            } else {
                userMessage += ` ${redact(String(categorizedError.message))}`;
            }

            await ctx.reply(userMessage);
        }
    });

    // Handle document uploads (Excel files for bank statements)
    bot.on("document", async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId) return;
        const doc = ctx.message?.document;
        if (!doc) return;

        const correlationId = `document-${chatId}-${Date.now()}`;
        const correlationLogger = createCorrelationLogger(correlationId);

        // Check if it's an Excel file
        const fileName = doc.file_name || "";
        const isExcel =
            fileName.endsWith(".xlsx") ||
            fileName.endsWith(".xls") ||
            doc.mime_type ===
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            doc.mime_type === "application/vnd.ms-excel";

        if (!isExcel) {
            correlationLogger.debug(
                { fileName, mimeType: doc.mime_type },
                "Ignoring non-Excel document"
            );
            return;
        }

        correlationLogger.info(
            {
                chatId,
                fileId: doc.file_id,
                fileName,
                fileSize: doc.file_size,
                mimeType: doc.mime_type,
            },
            "Processing Excel document"
        );

        // Send processing message
        const processingMsg = await ctx.reply(
            "📊 Processing bank statement Excel file..."
        );

        try {
            // Download the file from Telegram
            const file = await ctx.telegram.getFile(doc.file_id);
            if (!file.file_path) {
                throw new Error("Failed to get file path from Telegram");
            }

            const fileUrl = `https://api.telegram.org/file/bot${cfg.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

            // Create temp directory if it doesn't exist
            const tempDir = path.join(__dirname, "../../temp");
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Download file to temp location
            const tempFilePath = path.join(
                tempDir,
                `${Date.now()}-${fileName}`
            );

            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.status}`);
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(tempFilePath, buffer);

            correlationLogger.info(
                { tempFilePath },
                "Downloaded file to temp location"
            );

            // Parse caption for options
            const caption = ctx.message?.caption?.toLowerCase() || "";
            const skipAI =
                caption.includes("fast") ||
                caption.includes("skip-ai") ||
                caption.includes("no-ai");
            const isCreditCard =
                caption.includes("credit") || caption.includes("cc");

            // Determine bank config
            const bankName = isCreditCard
                ? "techcombank_credit"
                : "techcombank";
            const bankConfig = getBankConfig(bankName);

            // Update message
            await ctx.telegram.editMessageText(
                chatId,
                processingMsg.message_id,
                undefined,
                `📊 Processing ${fileName}...\n` +
                    `Statement type: ${bankConfig.statementType}\n` +
                    `AI classification: ${skipAI ? "Skipped" : "Enabled"}\n` +
                    "⏳ Please wait..."
            );

            // Process the file
            const result = await processBankStatementFile(
                tempFilePath,
                bankConfig,
                {
                    skipAI,
                    dryRun: false,
                },
                correlationId
            );

            // Clean up temp file
            try {
                fs.unlinkSync(tempFilePath);
            } catch (e) {
                correlationLogger.warn(
                    { error: e },
                    "Failed to clean up temp file"
                );
            }

            correlationLogger.info(
                {
                    batchId: result.batchId,
                    processed: result.processedCount,
                    failed: result.failedCount,
                },
                "Bank statement processing completed"
            );

            // Build reply message
            const replyLines = [
                "✅ Bank Statement Processed",
                "",
                `📄 File: ${fileName}`,
                `🏦 Bank: ${result.bank}`,
                `📋 Type: ${result.statementType}`,
                "",
                `📊 Transactions: ${result.totalTransactions}`,
                `✓ Processed: ${result.processedCount}`,
                `✗ Failed: ${result.failedCount}`,
                "",
                `💰 Expenses: ${result.summary.expenses} (${result.summary.totalExpenseVND.toLocaleString()} VND)`,
                `💵 Income: ${result.summary.income} (${result.summary.totalIncomeVND.toLocaleString()} VND)`,
                `🎯 Avg Confidence: ${(result.summary.avgConfidence * 100).toFixed(0)}%`,
                "",
                `🔖 Batch ID: ${result.batchId}`,
                "",
                "👉 Review pending actions in the web UI to approve/reject transactions.",
            ];

            if (result.failedCount > 0) {
                replyLines.push("");
                replyLines.push(
                    `⚠️ ${result.failedCount} transactions failed to process.`
                );
            }

            // Update the processing message with results
            await ctx.telegram.editMessageText(
                chatId,
                processingMsg.message_id,
                undefined,
                replyLines.join("\n")
            );
        } catch (e: any) {
            const categorizedError = handleAndLogError(
                e,
                {
                    chatId,
                    fileId: doc.file_id,
                    fileName,
                },
                "processDocument"
            );

            let userMessage = "❌ Failed to process the Excel file.";

            if (categorizedError.category === ErrorCategory.AI_SERVICE) {
                userMessage +=
                    '\nThe AI service is unavailable. Try with caption "fast" to skip AI.';
            } else if (categorizedError.category === ErrorCategory.NETWORK) {
                userMessage += "\nNetwork error. Please try again.";
            } else {
                userMessage += `\n${redact(String(categorizedError.message))}`;
            }

            await ctx.telegram.editMessageText(
                chatId,
                processingMsg.message_id,
                undefined,
                userMessage
            );
        }
    });

    // Handle callback queries from inline buttons
    bot.on("callback_query", async (ctx) => {
        const chatId = ctx.callbackQuery?.message?.chat.id;
        const messageId = ctx.callbackQuery?.message?.message_id;
        const data =
            "data" in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;

        if (!chatId || !data) return;

        const correlationId = `callback-${chatId}-${Date.now()}`;
        const correlationLogger = createCorrelationLogger(correlationId);

        correlationLogger.info(
            {
                chatId,
                action: data,
                messageId,
            },
            "Processing callback query"
        );

        // Acknowledge the callback query
        await ctx.answerCbQuery();

        const state = sessionStore.get(chatId);

        if (data.startsWith("approve_")) {
            // User approved the action
            if (!state?.pendingReview) {
                await ctx.reply(
                    "❌ No pending review found. Please try again."
                );
                return;
            }

            try {
                const res = await createPendingAction(
                    cfg,
                    state.pendingReview.payload,
                    state.pendingReview.correlationId
                );

                if (res.duplicate) {
                    correlationLogger.info(
                        {
                            pendingId: res.id,
                            hasAction: !!state.pendingReview.parsedAction,
                            actionType:
                                state.pendingReview.parsedAction?.action,
                        },
                        "User approved but found duplicate pending action"
                    );

                    await ctx.reply(
                        `⚠️ Duplicate detected!\n\nThis action is already pending review (ID: ${res.id}).\n\n${res.message || ""}`
                    );
                } else {
                    correlationLogger.info(
                        {
                            pendingId: res.id,
                            hasAction: !!state.pendingReview.parsedAction,
                            actionType:
                                state.pendingReview.parsedAction?.action,
                        },
                        "User approved and created pending action"
                    );

                    await ctx.reply(
                        "✅ Action approved and created successfully!"
                    );
                }

                // Edit the original message to show it was approved
                await ctx
                    .editMessageText(
                        "✅ *Approved*\n\n" +
                            formatPreviewMessage(
                                state.pendingReview.parsedAction,
                                state.pendingReview.payload.raw_input
                            ),
                        {
                            parse_mode: "Markdown",
                        }
                    )
                    .catch(() => {});

                // Clear the pending review
                sessionStore.set(chatId, {
                    ...state,
                    pendingReview: undefined,
                });
            } catch (e: any) {
                correlationLogger.error(
                    { error: e.message },
                    "Failed to create approved action"
                );
                await ctx.reply(
                    "❌ Failed to create action: " + redact(e.message)
                );
            }
        } else if (data.startsWith("edit_")) {
            // User wants to edit the action
            if (!state?.pendingReview) {
                await ctx.reply(
                    "❌ No pending review found. Please try again."
                );
                return;
            }

            await ctx.reply(
                "✏️ *Edit Mode*\n\n" +
                    "Please provide your corrections. You can say things like:\n" +
                    '• "Change amount to 150k"\n' +
                    '• "Date should be yesterday"\n' +
                    '• "Counterparty is Starbucks"\n' +
                    '• "Tag should be coffee"\n\n' +
                    "Or send a completely new version.",
                { parse_mode: "Markdown" }
            );

            // Update the message to show we're in edit mode
            await ctx
                .editMessageText(
                    "✏️ *Waiting for corrections...*\n\n" +
                        formatPreviewMessage(
                            state.pendingReview.parsedAction,
                            state.pendingReview.payload.raw_input
                        ),
                    { parse_mode: "Markdown" }
                )
                .catch(() => {});
        } else if (data.startsWith("cancel_")) {
            // User cancelled the action
            sessionStore.delete(chatId);

            await ctx.reply("❌ Action cancelled.");

            // Edit the original message to show it was cancelled
            if (messageId) {
                await ctx
                    .editMessageText(
                        "❌ *Cancelled*\n\n" +
                            (state?.pendingReview
                                ? formatPreviewMessage(
                                      state.pendingReview.parsedAction,
                                      state.pendingReview.payload.raw_input
                                  )
                                : "Action was cancelled"),
                        { parse_mode: "Markdown" }
                    )
                    .catch(() => {});
            }
        } else if (data.startsWith("batch_approve_") && !data.includes("_all")) {
            // Approve individual batch item
            const itemId = data.replace("batch_approve_", "");

            if (!state?.pendingBatch) {
                await ctx.reply("❌ No pending batch found.");
                return;
            }

            const item = state.pendingBatch.items.find((i) => i.id === itemId);
            if (!item) {
                await ctx.reply("❌ Item not found in batch.");
                return;
            }

            item.status = "approved";
            sessionStore.set(chatId, state);

            correlationLogger.info(
                { itemId, batchSize: state.pendingBatch.items.length },
                "Marked batch item as approved"
            );

            // Update the batch display
            await updateBatchDisplay(ctx, chatId, state, messageId);
        } else if (data.startsWith("batch_reject_") && !data.includes("_all")) {
            // Reject individual batch item
            const itemId = data.replace("batch_reject_", "");

            if (!state?.pendingBatch) {
                await ctx.reply("❌ No pending batch found.");
                return;
            }

            const item = state.pendingBatch.items.find((i) => i.id === itemId);
            if (!item) {
                await ctx.reply("❌ Item not found in batch.");
                return;
            }

            item.status = "rejected";
            sessionStore.set(chatId, state);

            correlationLogger.info(
                { itemId, batchSize: state.pendingBatch.items.length },
                "Marked batch item as rejected"
            );

            // Update the batch display
            await updateBatchDisplay(ctx, chatId, state, messageId);
        } else if (data === "batch_approve_all") {
            // Approve all pending items
            if (!state?.pendingBatch) {
                await ctx.reply("❌ No pending batch found.");
                return;
            }

            state.pendingBatch.items.forEach((item) => {
                if (item.status === "pending") {
                    item.status = "approved";
                }
            });
            sessionStore.set(chatId, state);

            correlationLogger.info(
                { batchSize: state.pendingBatch.items.length },
                "Marked all pending batch items as approved"
            );

            // Update the batch display
            await updateBatchDisplay(ctx, chatId, state, messageId);
        } else if (data === "batch_reject_all") {
            // Reject all pending items
            if (!state?.pendingBatch) {
                await ctx.reply("❌ No pending batch found.");
                return;
            }

            state.pendingBatch.items.forEach((item) => {
                if (item.status === "pending") {
                    item.status = "rejected";
                }
            });
            sessionStore.set(chatId, state);

            correlationLogger.info(
                { batchSize: state.pendingBatch.items.length },
                "Marked all pending batch items as rejected"
            );

            // Update the batch display
            await updateBatchDisplay(ctx, chatId, state, messageId);
        } else if (data === "batch_finish") {
            // Finish batch processing - save approved items
            if (!state?.pendingBatch) {
                await ctx.reply("❌ No pending batch found.");
                return;
            }

            const approvedItems = state.pendingBatch.items.filter(
                (i) => i.status === "approved"
            );
            const rejectedItems = state.pendingBatch.items.filter(
                (i) => i.status === "rejected"
            );

            if (approvedItems.length === 0) {
                await ctx.reply(
                    "ℹ️ No items were approved. Batch cleared."
                );
                // Clear batch
                sessionStore.set(chatId, {
                    ...state,
                    pendingBatch: undefined,
                });
                return;
            }

            correlationLogger.info(
                {
                    approved: approvedItems.length,
                    rejected: rejectedItems.length,
                },
                "Processing approved batch items"
            );

            // Create pending actions for approved items
            let successCount = 0;
            let failCount = 0;
            let maxMessageId = 0;

            for (const item of approvedItems) {
                try {
                    await createPendingAction(
                        cfg,
                        item.payload,
                        state.pendingBatch.correlationId
                    );
                    successCount++;
                    if (item.messageId > maxMessageId) {
                        maxMessageId = item.messageId;
                    }
                } catch (e: any) {
                    failCount++;
                    correlationLogger.error(
                        { error: e.message, itemId: item.id },
                        "Failed to create pending action for batch item"
                    );
                }
            }

            // Update last processed message ID
            if (maxMessageId > 0) {
                setLastProcessedMessageId(
                    state.pendingBatch.chatId,
                    state.pendingBatch.topicId,
                    maxMessageId
                );
            }

            // Clear batch
            sessionStore.set(chatId, {
                ...state,
                pendingBatch: undefined,
            });

            const resultMsg = [
                "✅ *Batch Processing Complete*",
                "",
                `✓ Created: ${successCount}`,
                `✗ Failed: ${failCount}`,
                `⊘ Rejected: ${rejectedItems.length}`,
                "",
                "Review pending actions in the web UI.",
            ].join("\n");

            await ctx.editMessageText(resultMsg, { parse_mode: "Markdown" });

            correlationLogger.info(
                { successCount, failCount, rejected: rejectedItems.length },
                "Batch processing completed"
            );
        }
    });

    // Helper function to update batch display
    async function updateBatchDisplay(
        ctx: any,
        chatId: number,
        state: SessionState,
        messageId: number | undefined
    ) {
        if (!state.pendingBatch || !messageId) return;

        const previewMsg = formatBatchPreviewMessage(state.pendingBatch.items);

        await ctx
            .editMessageText(previewMsg, {
                parse_mode: "Markdown",
                reply_markup: generateBatchKeyboard(state.pendingBatch.items),
            })
            .catch((e: any) => {
                logger.warn({ error: e.message }, "Failed to update batch display");
            });
    }

    return bot;
}
