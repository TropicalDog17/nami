import OpenAI from 'openai'
import { decode } from '@toon-format/toon'
import { createCorrelationLogger } from './logger.js'
import { withRetry } from './retry.js'
import { handleAndLogError, ErrorCategory } from './errors.js'

export interface VisionRow {
  date: string
  description: string
  amount: number
  sign: 'debit' | 'credit'
  reference?: string
}

export async function parseBankScreenshot(
  client: OpenAI,
  imageUrl: string,
  correlationId?: string,
  localeHint = 'vi-VN'
): Promise<{ toon: string; rows: VisionRow[] }> {
  const correlationLogger = createCorrelationLogger(correlationId)

  return withRetry(
    async () => {
      correlationLogger.debug({ imageUrl: imageUrl.substring(0, 100) }, 'Starting vision analysis')

      const system = `Extract a table of bank history rows from the image. Output ONLY a fenced code block labelled toon with rows[N]{date,description,amount,sign,reference}. Dates ISO YYYY-MM-DD. amount is unformatted number; sign in {debit,credit}.`
      const user = 'Image below. If multiple pages present, include all rows.'

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: user },
              { type: 'image_url', image_url: { url: imageUrl } }
            ] as any
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      }, {
        timeout: 60000 // 60 seconds
      })

      const content = response.choices[0]?.message?.content || ''

      if (!content.trim()) {
        throw new Error('Empty response from vision API')
      }

      const toon = extractCodeBlock(content) || content.trim()

      if (!toon.trim()) {
        throw new Error('No TOON content found in vision response')
      }

      correlationLogger.debug({
        contentLength: content.length,
        toonLength: toon.length,
        hasCodeBlock: extractCodeBlock(content) !== null
      }, 'Extracted TOON content from vision response')

      let decoded: any
      try {
        decoded = decode(toon)
      } catch (e: any) {
        throw new Error(`Failed to decode TOON: ${e.message}`)
      }

      const rows = (decoded?.rows || []) as VisionRow[]

      // Validate rows
      if (rows.length === 0) {
        correlationLogger.warn({ toon: toon.substring(0, 200) }, 'No rows found in vision response')
      } else {
        // Validate row structure
        const invalidRows = rows.filter((row, index) => {
          return !row.date || !row.description || typeof row.amount !== 'number' || !row.sign
        })

        if (invalidRows.length > 0) {
          correlationLogger.warn({
            invalidRows: invalidRows.length,
            totalRows: rows.length,
            invalidRowIndexes: invalidRows.map((_, i) => rows.indexOf(invalidRows[i]))
          }, 'Found invalid rows in vision response')
        }
      }

      correlationLogger.info({
        rowsCount: rows.length,
        contentLength: content.length,
        imageUrl: imageUrl.substring(0, 100)
      }, 'Successfully completed vision analysis')

      return { toon, rows }
    },
    'parseBankScreenshot',
    {
      maxAttempts: 3,
      baseDelayMs: 2000,
      maxDelayMs: 30000,
      retryableErrors: ['429', '503', '502', 'timeout', 'ECONNRESET']
    }
  )
}

function extractCodeBlock(text: string): string | null {
  const m = text.match(/```toon\n([\s\S]*?)```/)
  return m ? m[1].trim() : null
}


