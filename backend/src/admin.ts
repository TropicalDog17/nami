import { Router } from 'express';
import { store } from './store';

export const adminRouter = Router();

// ----- Transaction Types -----
adminRouter.get('/admin/types', (_req, res) => {
  res.json(store.listTypes());
});

adminRouter.get('/admin/types/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = store.getType(id);
  if (!item) return res.status(404).json({ error: 'Type not found' });
  res.json(item);
});

adminRouter.post('/admin/types', (req, res) => {
  try {
    const { name, description, is_active } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const created = store.createType({ name, description, is_active });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to create type' });
  }
});

adminRouter.put('/admin/types/:id', (req, res) => {
  const id = Number(req.params.id);
  const updated = store.updateType(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Type not found' });
  res.json(updated);
});

adminRouter.delete('/admin/types/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = store.deleteType(id);
  if (!ok) return res.status(404).json({ error: 'Type not found' });
  res.json({ deleted: 1 });
});

// ----- Accounts -----
adminRouter.get('/admin/accounts', (_req, res) => {
  res.json(store.listAccounts());
});

adminRouter.get('/admin/accounts/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = store.getAccount(id);
  if (!item) return res.status(404).json({ error: 'Account not found' });
  res.json(item);
});

adminRouter.post('/admin/accounts', (req, res) => {
  try {
    const { name, type, is_active } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const created = store.createAccount({ name, type, is_active });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to create account' });
  }
});

adminRouter.put('/admin/accounts/:id', (req, res) => {
  const id = Number(req.params.id);
  const updated = store.updateAccount(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Account not found' });
  res.json(updated);
});

adminRouter.delete('/admin/accounts/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = store.deleteAccount(id);
  if (!ok) return res.status(404).json({ error: 'Account not found' });
  res.json({ deleted: 1 });
});

// ----- Assets -----
adminRouter.get('/admin/assets', (_req, res) => {
  res.json(store.listAdminAssets());
});

adminRouter.get('/admin/assets/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = store.getAdminAsset(id);
  if (!item) return res.status(404).json({ error: 'Asset not found' });
  res.json(item);
});

adminRouter.post('/admin/assets', (req, res) => {
  try {
    const { symbol, name, decimals, is_active } = req.body || {};
    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ error: 'symbol is required' });
    }
    const created = store.createAdminAsset({ symbol, name, decimals, is_active });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to create asset' });
  }
});

adminRouter.put('/admin/assets/:id', (req, res) => {
  const id = Number(req.params.id);
  const updated = store.updateAdminAsset(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Asset not found' });
  res.json(updated);
});

adminRouter.delete('/admin/assets/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = store.deleteAdminAsset(id);
  if (!ok) return res.status(404).json({ error: 'Asset not found' });
  res.json({ deleted: 1 });
});

// ----- Tags -----
adminRouter.get('/admin/tags', (_req, res) => {
  res.json(store.listTags());
});

adminRouter.get('/admin/tags/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = store.getTag(id);
  if (!item) return res.status(404).json({ error: 'Tag not found' });
  res.json(item);
});

adminRouter.post('/admin/tags', (req, res) => {
  try {
    const { name, category, is_active } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const created = store.createTag({ name, category, is_active });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to create tag' });
  }
});

adminRouter.put('/admin/tags/:id', (req, res) => {
  const id = Number(req.params.id);
  const updated = store.updateTag(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Tag not found' });
  res.json(updated);
});

adminRouter.delete('/admin/tags/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = store.deleteTag(id);
  if (!ok) return res.status(404).json({ error: 'Tag not found' });
  res.json({ deleted: 1 });
});

// ----- AI Pending Actions (stubs) -----
// Minimal in-memory stub to satisfy frontend; returns empty list
adminRouter.get('/admin/pending-actions', (_req, res) => {
  res.json([]);
});

adminRouter.get('/admin/pending-actions/:id', (req, res) => {
  const id = String(req.params.id);
  return res.json({ id, status: 'pending', source: 'stub', raw_input: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
});

adminRouter.post('/admin/pending-actions/:id/accept', (_req, res) => {
  res.json({ ok: true });
});

adminRouter.post('/admin/pending-actions/:id/reject', (_req, res) => {
  res.json({ ok: true });
});

