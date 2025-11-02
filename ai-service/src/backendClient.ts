import crypto from 'crypto'
import { ActionRequest, PendingActionCreate, AccountRef, TagRef } from './schemas.js'
import { AppConfig } from './config.js'
import { logger } from './logger.js'

function signBody(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

export async function createPendingAction(cfg: AppConfig, payload: PendingActionCreate): Promise<{ id: string }> {
  const url = `${cfg.BACKEND_BASE_URL}/admin/pending-actions`
  const body = JSON.stringify(payload)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AI-Signature': signBody(cfg.BACKEND_SIGNING_SECRET, body)
    },
    body
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Backend create pending failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<{ id: string }>
}

export async function getGrounding(cfg: AppConfig): Promise<{ accounts: AccountRef[]; tags: TagRef[] }>
{
  const [accountsRes, tagsRes] = await Promise.all([
    fetch(`${cfg.BACKEND_BASE_URL}/admin/accounts`),
    fetch(`${cfg.BACKEND_BASE_URL}/admin/tags`)
  ])
  if (!accountsRes.ok || !tagsRes.ok) {
    throw new Error('Failed to fetch grounding data')
  }
  const accounts = (await accountsRes.json()) as Array<{ name: string }>
  const tags = (await tagsRes.json()) as Array<{ name: string }>
  return { accounts, tags }
}

export function redact(input: string, max = 200): string {
  return input.length > max ? `${input.slice(0, max)}…` : input
}

export function toActionRequest(obj: unknown): ActionRequest | null {
  if (!obj || typeof obj !== 'object') return null
  try {
    const { action, params } = obj as any
    if (!action || !params) return null
    return { action, params } as ActionRequest
  } catch (e) {
    logger.warn({ err: e }, 'toActionRequest failed')
    return null
  }
}


