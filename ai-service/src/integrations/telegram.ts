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
import { PendingActionCreate } from "../core/schemas.js";
import { handleAndLogError, ErrorCategory } from "../utils/errors.js";
import {
    processBankStatementFile,
    getBankConfig,
    formatBatchResult,
} from "../api/batchProcessor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Ctx = Context & { state: Record<string, unknown> };

interface SessionState {
    awaitingAccountForBatch?: string;
    pendingReview?: {
        payload: PendingActionCreate;
        correlationId: string;
        parsedAction: any;
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
        }
    });

    return bot;
}
