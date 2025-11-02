import OpenAI from 'openai'
import { decode } from '@toon-format/toon'

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
  localeHint = 'vi-VN'
): Promise<{ toon: string; rows: VisionRow[] }> {
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
    temperature: 0.1
  })
  const content = response.choices[0]?.message?.content || ''
  const toon = extractCodeBlock(content) || content.trim()
  const decoded = decode(toon) as any
  const rows = (decoded?.rows || []) as VisionRow[]
  return { toon, rows }
}

function extractCodeBlock(text: string): string | null {
  const m = text.match(/```toon\n([\s\S]*?)```/)
  return m ? m[1].trim() : null
}


