import { z } from 'zod'

export const SpendParamsSchema = z.object({
  account: z.string().min(1),
  vnd_amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  counterparty: z.string().optional(),
  tag: z.string().optional(),
  note: z.string().optional()
})

export const ActionRequestSchema = z.object({
  action: z.enum(['spend_vnd', 'credit_spend_vnd']),
  params: SpendParamsSchema
})

export type SpendParams = z.infer<typeof SpendParamsSchema>
export type ActionRequest = z.infer<typeof ActionRequestSchema>

export type PendingSource = 'telegram_text' | 'telegram_image'

export interface PendingActionCreate {
  source: PendingSource
  raw_input: string
  toon_text?: string
  action_json?: ActionRequest
  confidence?: number
  batch_id?: string
  meta?: Record<string, unknown>
}

export interface AccountRef {
  name: string
}
export interface TagRef {
  name: string
}


