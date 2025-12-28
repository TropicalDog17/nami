import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { transactionService } from '../services/transaction.service';
import { settingsRepository } from '../repositories/settings.repository';
import { vaultService } from '../services/vault.service';
import { transactionRepository } from '../repositories/transaction.repository';
import { Asset } from '../types';

export const aiRouter = Router();

// Verify AI service signature
function verifySignature(req: Request, secret: string): boolean {
  const signature = req.headers['x-ai-signature'] as string;
  if (!signature || !secret) return false;

  const body = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Middleware for signature verification (optional - can be enabled via env)
const requireSignature = (req: Request, res: Response, next: Function) => {
  const secret = process.env.BACKEND_SIGNING_SECRET;
  if (secret && !verifySignature(req, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  next();
};

/**
 * POST /api/ai/expense-vnd
 * Record an expense in VND - AI doesn't need to know vault names
 * Body: { vnd_amount, date, counterparty?, tag?, note?, source_ref? }
 */
aiRouter.post('/ai/expense-vnd', requireSignature, async (req: Request, res: Response) => {
  try {
    const { vnd_amount, date, counterparty, tag, note, source_ref } = req.body || {};

    if (!vnd_amount || typeof vnd_amount !== 'number' || vnd_amount <= 0) {
      return res.status(400).json({ error: 'vnd_amount is required and must be positive' });
    }
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD format)' });
    }

    // Use default spending vault from settings
    const account = settingsRepository.getDefaultSpendingVaultName();
    vaultService.ensureVault(account);

    // Check for existing transaction (deduplication)
    const existing = transactionRepository.findExisting({
      sourceRef: source_ref,
      date,
      amount: vnd_amount,
      type: 'EXPENSE',
      account,
    });

    if (existing) {
      return res.status(200).json({
        ok: true,
        duplicate: true,
        transaction_id: existing.id,
        account_used: account,
        message: 'Transaction already exists',
      });
    }

    const asset: Asset = { type: 'FIAT', symbol: 'VND' };

    const tx = await transactionService.createExpenseTransaction({
      asset,
      amount: vnd_amount,
      at: date,
      account,
      note: note || undefined,
      category: tag || undefined,
      counterparty: counterparty || undefined,
      sourceRef: source_ref,
    });

    res.status(201).json({
      ok: true,
      duplicate: false,
      transaction_id: tx.id,
      account_used: account,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to record expense' });
  }
});

/**
 * POST /api/ai/income-vnd
 * Record income in VND - AI doesn't need to know vault names
 * Body: { vnd_amount, date, counterparty?, tag?, note?, source_ref? }
 */
aiRouter.post('/ai/income-vnd', requireSignature, async (req: Request, res: Response) => {
  try {
    const { vnd_amount, date, counterparty, tag, note, source_ref } = req.body || {};

    if (!vnd_amount || typeof vnd_amount !== 'number' || vnd_amount <= 0) {
      return res.status(400).json({ error: 'vnd_amount is required and must be positive' });
    }
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD format)' });
    }

    // Use default income vault from settings
    const account = settingsRepository.getDefaultIncomeVaultName();
    vaultService.ensureVault(account);

    // Check for existing transaction (deduplication)
    const existing = transactionRepository.findExisting({
      sourceRef: source_ref,
      date,
      amount: vnd_amount,
      type: 'INCOME',
      account,
    });

    if (existing) {
      return res.status(200).json({
        ok: true,
        duplicate: true,
        transaction_id: existing.id,
        account_used: account,
        message: 'Transaction already exists',
      });
    }

    const asset: Asset = { type: 'FIAT', symbol: 'VND' };

    const tx = await transactionService.createIncomeTransaction({
      asset,
      amount: vnd_amount,
      at: date,
      account,
      note: note || undefined,
      category: tag || undefined,
      counterparty: counterparty || undefined,
      sourceRef: source_ref,
    });

    res.status(201).json({
      ok: true,
      duplicate: false,
      transaction_id: tx.id,
      account_used: account,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to record income' });
  }
});

/**
 * POST /api/ai/credit-expense-vnd
 * Record a credit card expense in VND
 * Body: { vnd_amount, date, counterparty?, tag?, note?, credit_account?, source_ref? }
 */
aiRouter.post('/ai/credit-expense-vnd', requireSignature, async (req: Request, res: Response) => {
  try {
    const { vnd_amount, date, counterparty, tag, note, credit_account, source_ref } = req.body || {};

    if (!vnd_amount || typeof vnd_amount !== 'number' || vnd_amount <= 0) {
      return res.status(400).json({ error: 'vnd_amount is required and must be positive' });
    }
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD format)' });
    }

    // Use credit account if provided, otherwise use spending vault
    const account = credit_account || settingsRepository.getDefaultSpendingVaultName();
    vaultService.ensureVault(account);

    // Check for existing transaction (deduplication)
    const existing = transactionRepository.findExisting({
      sourceRef: source_ref,
      date,
      amount: vnd_amount,
      type: 'EXPENSE',
      account,
    });

    if (existing) {
      return res.status(200).json({
        ok: true,
        duplicate: true,
        transaction_id: existing.id,
        account_used: account,
        message: 'Transaction already exists',
      });
    }

    const asset: Asset = { type: 'FIAT', symbol: 'VND' };

    const tx = await transactionService.createExpenseTransaction({
      asset,
      amount: vnd_amount,
      at: date,
      account,
      note: note ? `[Credit] ${note}` : '[Credit Card Expense]',
      category: tag || undefined,
      counterparty: counterparty || undefined,
      sourceRef: source_ref,
    });

    res.status(201).json({
      ok: true,
      duplicate: false,
      transaction_id: tx.id,
      account_used: account,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to record credit expense' });
  }
});

/**
 * POST /api/ai/card-payment-vnd
 * Record a payment to credit card from debit account
 * Body: { vnd_amount, date, from_account?, to_credit_account?, note? }
 */
aiRouter.post('/ai/card-payment-vnd', requireSignature, async (req: Request, res: Response) => {
  try {
    const { vnd_amount, date, from_account, to_credit_account, note } = req.body || {};

    if (!vnd_amount || typeof vnd_amount !== 'number' || vnd_amount <= 0) {
      return res.status(400).json({ error: 'vnd_amount is required and must be positive' });
    }
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD format)' });
    }

    // This is a transfer from spending account to credit account
    // For now, just record as expense from spending account (simplification)
    const account = from_account || settingsRepository.getDefaultSpendingVaultName();
    vaultService.ensureVault(account);

    const asset: Asset = { type: 'FIAT', symbol: 'VND' };

    const tx = await transactionService.createExpenseTransaction({
      asset,
      amount: vnd_amount,
      at: date,
      account,
      note: note || 'Credit card payment',
      category: 'card_payment',
    });

    res.status(201).json({
      ok: true,
      transaction_id: tx.id,
      account_used: account,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to record card payment' });
  }
});

/**
 * GET /api/ai/settings
 * Get current vault settings for AI service
 */
aiRouter.get('/ai/settings', (_req: Request, res: Response) => {
  res.json({
    default_spending_vault: settingsRepository.getDefaultSpendingVaultName(),
    default_income_vault: settingsRepository.getDefaultIncomeVaultName(),
  });
});
