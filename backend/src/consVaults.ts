import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from './store';
import { Transaction, Asset } from './types';
import { priceService } from './priceService';

export const consVaultsRouter = Router();

async function getRate(asset: Asset, at?: string) {
  return priceService.getRateUSD(asset, at);
}

function toTokenizedShape(v: { name: string; status: 'ACTIVE' | 'CLOSED'; createdAt: string }) {
  const now = new Date().toISOString();
  return store.vaultStats(v.name).then((stats) => {
    const aum = stats.aumUSD;
    const depositUSD = stats.totalDepositedUSD;
    const withdrawnUSD = stats.totalWithdrawnUSD;
    // ROI = (Current Value + Withdrawn - Invested) / Invested
    // If Invested (depositUSD) is 0, ROI is 0.
    const perfPct = depositUSD > 0 ? ((aum + withdrawnUSD - depositUSD) / depositUSD) * 100 : 0;
    const price = 1; // simple: 1 USD per share model logic for tokenization metadata (can be improved later)
    const supply = aum > 0 ? aum / price : 0;
    return {
      id: v.name,
      name: v.name,
      description: '',
      type: 'user_defined',
      status: v.status === 'ACTIVE' ? 'active' : 'closed',
      token_symbol: v.name.slice(0, 8).toUpperCase(),
      token_decimals: 2,
      total_supply: String(supply),
      total_assets_under_management: String(aum),
      current_share_price: String(price.toFixed(4)),
      initial_share_price: '1',
      is_user_defined_price: true,
      manual_price_per_share: String(price.toFixed(4)),
      price_last_updated_by: 'system',
      price_last_updated_at: now,
      price_update_notes: '',
      is_deposit_allowed: true,
      is_withdrawal_allowed: true,
      min_deposit_amount: '0',
      min_withdrawal_amount: '0',
      inception_date: v.createdAt,
      last_updated: now,
      performance_since_inception: String(perfPct),
      created_by: 'local',
      created_at: v.createdAt,
      updated_at: now,
    };
  });
}

// List
consVaultsRouter.get('/cons-vaults', async (_req, res) => {
  try {
    const vs = store.listVaults();
    const shaped = await Promise.all(vs.map(toTokenizedShape));
    res.json(shaped);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to list vaults' });
  }
});

// Get one
consVaultsRouter.get('/cons-vaults/:id', async (req, res) => {
  const id = String(req.params.id);
  const v = store.getVault(id);
  if (!v) return res.status(404).json({ error: 'not found' });
  const shaped = await toTokenizedShape(v);
  res.json(shaped);
});

// Create
consVaultsRouter.post('/cons-vaults', (req, res) => {
  const name = String(req.body?.name || '').trim() || String(req.body?.token_symbol || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  store.ensureVault(name);
  res.status(201).json({ id: name });
});

// Update (no-op minimal)
consVaultsRouter.put('/cons-vaults/:id', (_req, res) => {
  res.json({ ok: true });
});

// Delete
consVaultsRouter.delete('/cons-vaults/:id', (req, res) => {
  const id = String(req.params.id);
  const ok = store.deleteVault(id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Close
consVaultsRouter.post('/cons-vaults/:id/close', (req, res) => {
  const id = String(req.params.id);
  const ok = store.endVault(id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Enable/disable manual pricing (no-op)
consVaultsRouter.post('/cons-vaults/:id/enable-manual-pricing', (_req, res) => {
  res.json({ ok: true });
});
consVaultsRouter.post('/cons-vaults/:id/disable-manual-pricing', (_req, res) => {
  res.json({ ok: true });
});

// Update price (no-op returns current computed)
consVaultsRouter.post('/cons-vaults/:id/update-price', async (req, res) => {
  const id = String(req.params.id);
  const v = store.getVault(id);
  if (!v) return res.status(404).json({ error: 'not found' });
  const shaped = await toTokenizedShape(v);
  res.json({ current_share_price: shaped.current_share_price, total_assets_under_management: shaped.total_assets_under_management });
});

// Update total value
consVaultsRouter.post('/cons-vaults/:id/update-total-value', async (req, res) => {
  const id = String(req.params.id);
  const v = store.getVault(id);
  if (!v) return res.status(404).json({ error: 'not found' });
  const totalValue = Number(req.body?.total_value || 0) || 0;
  const notes = req.body?.notes ? String(req.body.notes) : undefined;
  const asset: Asset = { type: 'FIAT', symbol: 'USD' };

  // Persist by adjusting vault account balance with an INCOME/EXPENSE delta so that
  // AUM (based on holdings) matches totalValue. This keeps the ledger consistent.
  try {
    const stats = await store.vaultStats(id);
    const currentAUM = stats.aumUSD || 0;
    const delta = totalValue - currentAUM;
    if (Math.abs(delta) > 1e-6) {
      const note = `Manual revaluation to ${totalValue}` + (notes ? `: ${notes}` : '');
      if (delta > 0) {
        await store.recordIncomeTx({ asset, amount: delta, at: new Date().toISOString(), account: id, note });
      } else {
        await store.recordExpenseTx({ asset, amount: -delta, at: new Date().toISOString(), account: id, note });
      }
    }
  } catch (e) {
    // If anything fails, still return echo response but log to console
    console.warn('update-total-value adjustment failed', e);
  }

  const price = 1;
  res.json({ current_share_price: String(price.toFixed(4)), total_assets_under_management: String(totalValue) });
});

// Deposits and withdrawals
consVaultsRouter.post('/cons-vaults/:id/deposit', async (req, res) => {
  const id = String(req.params.id);
  if (!store.getVault(id)) store.ensureVault(id);
  const amount = Number(req.body?.amount || 0) || 0;
  const notes = req.body?.notes ? String(req.body.notes) : undefined;
  const source = req.body?.source_account ? String(req.body.source_account) : undefined;

  if (!(amount > 0)) return res.status(400).json({ error: 'amount>0 required' });

  const at = new Date().toISOString();
  const asset: Asset = { type: 'FIAT', symbol: 'USD' }; // Hardcoded to USD 

  store.addVaultEntry({ vault: id, type: 'DEPOSIT', asset, amount, usdValue: amount, at, account: source, note: notes });

  // Create Transaction
  const rate = await getRate(asset, at);
  if (source) {
    // Transfer Source -> Vault
    const transferId = uuidv4();
    const txOut: Transaction = {
      id: uuidv4(),
      type: "TRANSFER_OUT",
      asset,
      amount,
      createdAt: at,
      account: source,
      note: `Deposit to ${id}` + (notes ? `: ${notes}` : ""),
      transferId,
      rate,
      usdAmount: amount * rate.rateUSD
    } as Transaction;

    const txIn: Transaction = {
      id: uuidv4(),
      type: "TRANSFER_IN",
      asset,
      amount,
      createdAt: at,
      account: id, // Vault Name is the Account
      note: `Deposit from ${source}` + (notes ? `: ${notes}` : ""),
      transferId,
      rate,
      usdAmount: amount * rate.rateUSD
    } as Transaction;

    store.addTransaction(txOut);
    store.addTransaction(txIn);
  } else {
    // Income (Injection) to Vault
    const tx: Transaction = {
      id: uuidv4(),
      type: "INCOME",
      asset,
      amount,
      createdAt: at,
      account: id,
      note: `Deposit` + (notes ? `: ${notes}` : ""),
      rate,
      usdAmount: amount * rate.rateUSD
    } as Transaction;
    store.addTransaction(tx);
  }

  res.status(201).json({ ok: true });
});

consVaultsRouter.post('/cons-vaults/:id/withdraw', async (req, res) => {
  const id = String(req.params.id);
  if (!store.getVault(id)) store.ensureVault(id);
  const amount = Number(req.body?.amount || 0) || 0;
  const notes = req.body?.notes ? String(req.body.notes) : undefined;
  if (!(amount > 0)) return res.status(400).json({ error: 'amount>0 required' });

  const at = new Date().toISOString();
  const asset: Asset = { type: 'FIAT', symbol: 'USD' };

  store.addVaultEntry({ vault: id, type: 'WITHDRAW', asset, amount, usdValue: amount, at, note: notes });

  const rate = await getRate(asset, at);
  // Treated as Expense (Outflow) from Vault
  const tx: Transaction = {
    id: uuidv4(),
    type: "EXPENSE",
    asset,
    amount,
    createdAt: at,
    account: id,
    note: `Withdraw` + (notes ? `: ${notes}` : ""),
    rate,
    usdAmount: amount * rate.rateUSD
  } as Transaction;

  store.addTransaction(tx);

  res.status(201).json({ ok: true });
});
