import { Router, Request, Response } from 'express';
import { adminRepository } from '../repositories/admin.repository';
import { settingsRepository } from '../repositories/settings.repository';
import { vaultService } from '../services/vault.service';

export const adminRouter = Router();

// Settings: Default Spending Vault
adminRouter.get('/admin/settings', (_req: Request, res: Response) => {
  try {
    const spending = settingsRepository.getDefaultSpendingVaultName();
    const borrow = settingsRepository.getBorrowingSettings();
    res.json({
      default_spending_vault: spending,
      borrowing_vault: borrow.name,
      borrowing_monthly_rate: borrow.rate,
      borrowing_last_accrual_at: borrow.lastAccrualStart,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to read settings' });
  }
});

adminRouter.post('/admin/settings/spending-vault', (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });

    settingsRepository.setDefaultSpendingVaultName(name);
    vaultService.ensureVault(name);

    res.status(200).json({ default_spending_vault: name });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'failed to set spending vault' });
  }
});

// Transaction Types
adminRouter.get('/admin/types', (_req: Request, res: Response) => {
  res.json(adminRepository.findAllTypes());
});

adminRouter.get('/admin/types/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = adminRepository.findTypeById(id);
  if (!item) return res.status(404).json({ error: 'Type not found' });
  res.json(item);
});

adminRouter.post('/admin/types', (req: Request, res: Response) => {
  try {
    const { name, description, is_active } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const created = adminRepository.createType({ name, description, is_active });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to create type' });
  }
});

adminRouter.put('/admin/types/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = adminRepository.updateType(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Type not found' });
  res.json(updated);
});

adminRouter.delete('/admin/types/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = adminRepository.deleteType(id);
  if (!ok) return res.status(404).json({ error: 'Type not found' });
  res.json({ deleted: 1 });
});

// Accounts
adminRouter.get('/admin/accounts', (_req: Request, res: Response) => {
  res.json(adminRepository.findAllAccounts());
});

adminRouter.get('/admin/accounts/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = adminRepository.findAccountById(id);
  if (!item) return res.status(404).json({ error: 'Account not found' });
  res.json(item);
});

adminRouter.post('/admin/accounts', (req: Request, res: Response) => {
  try {
    const { name, type, is_active } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const created = adminRepository.createAccount({ name, type, is_active });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to create account' });
  }
});

adminRouter.put('/admin/accounts/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = adminRepository.updateAccount(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Account not found' });
  res.json(updated);
});

adminRouter.delete('/admin/accounts/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = adminRepository.deleteAccount(id);
  if (!ok) return res.status(404).json({ error: 'Account not found' });
  res.json({ deleted: 1 });
});

// Assets
adminRouter.get('/admin/assets', (_req: Request, res: Response) => {
  res.json(adminRepository.findAllAssets());
});

adminRouter.get('/admin/assets/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = adminRepository.findAssetById(id);
  if (!item) return res.status(404).json({ error: 'Asset not found' });
  res.json(item);
});

adminRouter.post('/admin/assets', (req: Request, res: Response) => {
  try {
    const { symbol, name, decimals, is_active } = req.body || {};
    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ error: 'symbol is required' });
    }
    const created = adminRepository.createAsset({ symbol, name, decimals, is_active });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to create asset' });
  }
});

adminRouter.put('/admin/assets/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = adminRepository.updateAsset(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Asset not found' });
  res.json(updated);
});

adminRouter.delete('/admin/assets/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = adminRepository.deleteAsset(id);
  if (!ok) return res.status(404).json({ error: 'Asset not found' });
  res.json({ deleted: 1 });
});

// Tags
adminRouter.get('/admin/tags', (_req: Request, res: Response) => {
  res.json(adminRepository.findAllTags());
});

adminRouter.get('/admin/tags/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = adminRepository.findTagById(id);
  if (!item) return res.status(404).json({ error: 'Tag not found' });
  res.json(item);
});

adminRouter.post('/admin/tags', (req: Request, res: Response) => {
  try {
    const { name, category, is_active } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const created = adminRepository.createTag({ name, category, is_active });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to create tag' });
  }
});

adminRouter.put('/admin/tags/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = adminRepository.updateTag(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Tag not found' });
  res.json(updated);
});

adminRouter.delete('/admin/tags/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = adminRepository.deleteTag(id);
  if (!ok) return res.status(404).json({ error: 'Tag not found' });
  res.json({ deleted: 1 });
});

// AI Pending Actions (stubs)
adminRouter.get('/admin/pending-actions', (_req: Request, res: Response) => {
  res.json([]);
});

adminRouter.get('/admin/pending-actions/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  return res.json({
    id,
    status: 'pending',
    source: 'stub',
    raw_input: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
});

adminRouter.post('/admin/pending-actions/:id/accept', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

adminRouter.post('/admin/pending-actions/:id/reject', (_req: Request, res: Response) => {
  res.json({ ok: true });
});
