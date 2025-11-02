import OpenAI from 'openai'
import { encode, decode } from '@toon-format/toon'
import { ActionRequest, ActionRequestSchema, AccountRef, TagRef } from './schemas.js'

export interface ParseTextResult {
  toon: string
  action?: ActionRequest
  confidence?: number
}

export async function parseExpenseText(
  client: OpenAI,
  message: string,
  accounts: AccountRef[],
  tags: TagRef[]
): Promise<ParseTextResult> {
  const grounding = {
    accounts: accounts.map((a) => a.name),
    tags: tags.map((t) => t.name)
  }

  const groundingToon = [
    `accounts[${grounding.accounts.length}]: ${grounding.accounts.join(',')}`,
    `tags[${grounding.tags.length}]: ${grounding.tags.join(',')}`
  ].join('\n')

  const system = `You are a precise financial parser. Output ONLY a fenced code block labelled toon with a single TOON object having keys action and params.`
  const user = [
    'Extract a spend action from the message into TOON with 2-space indent.',
    'Rules:',
    '- action must be one of: spend_vnd, credit_spend_vnd',
    '- params: account, vnd_amount (number), date (YYYY-MM-DD), counterparty?, tag?, note?',
    '- account must be from accounts list; tag must be from tags list if present',
    '- If date missing, assume today in configured timezone',
    '- Use unformatted numbers (no commas); Vietnamese k = thousand may appear',
    '',
    'Grounding:',
    '```toon',
    groundingToon,
    '```',
    '',
    'Message:',
    message,
    '',
    'Output ONLY the TOON code block.'
  ].join('\n')

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2
  })
  const content = completion.choices[0]?.message?.content || ''
  const toon = extractCodeBlock(content) || content.trim()
  let action: ActionRequest | undefined
  try {
    const decoded = decode(toon) as any
    action = ActionRequestSchema.parse(decoded)
  } catch (_) {
    action = undefined
  }
  return { toon, action, confidence: undefined }
}

function extractCodeBlock(text: string): string | null {
  const m = text.match(/```toon\n([\s\S]*?)```/)
  return m ? m[1].trim() : null
}


