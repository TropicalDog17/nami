import { LLMClient } from '../integrations/llm.js'
import { ActionRequest, ActionRequestSchema, AccountRef, TagRef } from '../core/schemas.js'
import { createCorrelationLogger } from '../utils/logger.js'
import { handleAndLogError, ErrorCategory } from '../utils/errors.js'

export interface ParseTextResult {
  toon: string
  action?: ActionRequest
  confidence?: number
}

export async function parseExpenseText(
  llmClient: LLMClient,
  message: string,
  accounts: AccountRef[],
  tags: TagRef[],
  correlationId?: string
): Promise<ParseTextResult> {
  const correlationLogger = createCorrelationLogger(correlationId)

  correlationLogger.debug({
    messageLength: message.length,
    accountsCount: accounts.length,
    tagsCount: tags.length,
    messagePreview: message.substring(0, 100),
    provider: llmClient.getProvider()
  }, 'Starting text parsing')

  const grounding = {
    accounts: accounts.map((a) => a.name),
    tags: tags.map((t) => t.name)
  }

  const groundingJson = [
    `accounts[${grounding.accounts.length}]: ${grounding.accounts.join(',')}`,
    `tags[${grounding.tags.length}]: ${grounding.tags.join(',')}`
  ].join('\n')

  const system = `You are a precise financial parser. Output ONLY a fenced code block labelled json with a single JSON object having keys action and params.`
  const user = [
    'Extract a spend action from the message into JSON with 2-space indent.',
    'Rules:',
    '- action must be one of: spend_vnd, credit_spend_vnd',
    '- params: account, vnd_amount (number), date (YYYY-MM-DD), counterparty?, tag?, note?',
    '- account must be from accounts list; tag must be from tags list if present',
    '- If date missing, assume today in configured timezone',
    '- Use unformatted numbers (no commas); Vietnamese k = thousand may appear',
    '',
    'Grounding:',
    '```json',
    groundingJson,
    '```',
    '',
    'Message:',
    message,
    '',
    'Output ONLY the JSON code block.'
  ].join('\n')

  const response = await llmClient.chat([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], {
    temperature: 0.2,
    maxTokens: 1000
  })

  const content = response.content

  if (!content.trim()) {
    throw new Error('Empty response from text parsing API')
  }

  const toon = extractCodeBlock(content) || content.trim()

  if (!toon.trim()) {
    correlationLogger.warn({ content: content.substring(0, 200) }, 'No JSON content found in text response')
    return { toon: content, action: undefined, confidence: undefined }
  }

  correlationLogger.debug({
    contentLength: content.length,
    toonLength: toon.length,
    hasCodeBlock: extractCodeBlock(content) !== null
  }, 'Extracted TOON content from text response')

  let action: ActionRequest | undefined
  try {
    const decoded = JSON.parse(toon) as any
    action = ActionRequestSchema.parse(decoded)

    // Additional validation
    if (!action.params.account || !action.params.vnd_amount || !action.params.date) {
      throw new Error('Missing required parameters in parsed action')
    }

    // Validate account is in grounding list
    const accountExists = grounding.accounts.includes(action.params.account)
    if (!accountExists) {
      correlationLogger.warn({
        providedAccount: action.params.account,
        availableAccounts: grounding.accounts
      }, 'Parsed account not found in grounding list')
    }

    // Validate tag if provided
    if (action.params.tag) {
      const tagExists = grounding.tags.includes(action.params.tag)
      if (!tagExists) {
        correlationLogger.warn({
          providedTag: action.params.tag,
          availableTags: grounding.tags
        }, 'Parsed tag not found in grounding list')
      }
    }

    correlationLogger.info({
      action: action.action,
      account: action.params.account,
      amount: action.params.vnd_amount,
      date: action.params.date,
      hasCounterparty: !!action.params.counterparty,
      hasTag: !!action.params.tag
    }, 'Successfully parsed text to action')

  } catch (e: any) {
    correlationLogger.warn({
      error: e.message,
      json: toon.substring(0, 200)
    }, 'Failed to parse JSON to valid action')
    action = undefined
  }

  return { toon, action, confidence: undefined }
}

function extractCodeBlock(text: string): string | null {
  const m = text.match(/```(?:toon|json)\n([\s\S]*?)```/)
  return m ? m[1].trim() : null
}


