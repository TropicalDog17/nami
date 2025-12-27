import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { priceService } from './priceService';
import { Asset, Vault, VaultEntry } from './types';
import { store } from './store';

export const vaultsRouter = Router();

// helpers
async function computeUSD(asset: Asset, amount: number, at?: string): Promise<number> {
  const rate = await priceService.getRateUSD(asset, at);
  return amount * rate.rateUSD;
}

function parseDepositPayload(body: any): { asset: Asset; amount: number; usdValue: number; at?: string; account?: string; note?: string } {
  const at: string | undefined = body.at || (typeof body.date === 'string' ? body.date : undefined);
  const account: string | undefined = body.account || body.sourceAccount || undefined;
  const note: string | undefined = body.note || undefined;
  // Accept either { asset, amount } or { asset, quantity, cost } or USD-only { cost }
  const assetSym = (body.asset?.symbol || body.asset || 'USD').toString().toUpperCase();
  const assetType = assetSym.length === 3 ? 'FIAT' : 'CRYPTO';
  const asset: Asset = { type: assetType as any, symbol: assetSym };
  const quantity = Number(body.quantity ?? body.amount ?? 0) || 0;
  const cost = Number(body.cost ?? body.value ?? body.usdValue ?? 0) || 0;

  if (asset.symbol === 'USD') {
    const usdValue = cost > 0 ? cost : quantity; // allow amount as direct USD
    return { asset, amount: usdValue, usdValue, at, account, note };
  }
  // non-USD: require both quantity and cost
  if (!(quantity > 0) || !(cost > 0)) throw new Error('quantity and cost required for non-USD deposit');
  return { asset, amount: quantity, usdValue: cost, at, account, note };
}

function parseWithdrawPayload(body: any): { asset: Asset; amount: number; usdValue: number; at?: string; account?: string; note?: string } {
  const at: string | undefined = body.at || (typeof body.date === 'string' ? body.date : undefined);
  const account: string | undefined = body.account || body.targetAccount || undefined;
  const note: string | undefined = body.note || undefined;
  const assetSym = (body.asset?.symbol || body.asset || 'USD').toString().toUpperCase();
  const assetType = assetSym.length === 3 ? 'FIAT' : 'CRYPTO';
  const asset: Asset = { type: assetType as any, symbol: assetSym };
  const quantity = Number(body.quantity ?? body.amount ?? 0) || 0;
  const value = Number(body.value ?? body.usdValue ?? 0) || 0;

  if (asset.symbol === 'USD') {
    const usdValue = value > 0 ? value : quantity;
    return { asset, amount: usdValue, usdValue, at, account, note };
  }
  if (!(quantity > 0) || !(value > 0)) throw new Error('quantity and value required for non-USD withdraw');
  return { asset, amount: quantity, usdValue: value, at, account, note };
}

// Create or ensure a vault exists
vaultsRouter.post('/vaults', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const created = store.ensureVault(name);
  res.status(created ? 201 : 200).json(store.getVault(name));
});

// List vaults (optionally only open and enrich data)
vaultsRouter.get('/vaults', async (req, res) => {
  const isOpen = String(req.query.is_open || '').toLowerCase() === 'true';
  const enrich = String(req.query.enrich || '').toLowerCase() === 'true';
  const list = store.listVaults().filter(v => (isOpen ? v.status === 'ACTIVE' : true));
  if (!enrich) return res.json(list);

  const enriched = await Promise.all(list.map(async (v) => {
    const stats = await store.vaultStats(v.name);
    const depositUSD = stats.totalDepositedUSD;
    const withdrawnUSD = stats.totalWithdrawnUSD;
    const aumUSD = stats.aumUSD;
    const roi = depositUSD > 0 ? ((aumUSD + withdrawnUSD - depositUSD) / depositUSD) * 100 : 0;
    return {
      id: v.name,
      name: v.name,
      status: v.status.toLowerCase() === 'active' ? 'active' : 'closed',
      inception_date: v.createdAt,
      total_contributed_usd: depositUSD,
      total_withdrawn_usd: withdrawnUSD,
      total_assets_under_management: aumUSD,
      current_share_price: 0,
      total_supply: 0,
      roi_realtime_percent: roi,
    };
  }));
  res.json(enriched);
});

// Get single vault with legacy-friendly shape
vaultsRouter.get('/vaults/:name', async (req, res) => {
  const name = String(req.params.name);
  const v = store.getVault(name);
  if (!v) return res.status(404).json({ error: 'not found' });
  const stats = await store.vaultStats(name);
  const depositUSD = stats.totalDepositedUSD;
  const withdrawnUSD = stats.totalWithdrawnUSD;
  const aumUSD = stats.aumUSD;
  const roi = depositUSD > 0 ? ((aumUSD + withdrawnUSD - depositUSD) / depositUSD) * 100 : 0;
  const firstEntry = store.getVaultEntries(name)[0];
  res.json({
    id: v.name,
    is_vault: true,
    vault_name: v.name,
    vault_status: v.status === 'ACTIVE' ? 'active' : 'closed',
    vault_ended_at: v.status === 'CLOSED' ? v.createdAt : undefined,
    asset: 'USD',
    account: v.name,
    deposit_date: firstEntry?.at ?? v.createdAt,
    deposit_qty: String(depositUSD),
    deposit_cost: String(depositUSD),
    deposit_unit_cost: '1',
    withdrawal_qty: String(withdrawnUSD),
    withdrawal_value: String(withdrawnUSD),
    withdrawal_unit_price: '1',
    pnl: String(aumUSD + withdrawnUSD - depositUSD),
    pnl_percent: String(roi),
    is_open: v.status === 'ACTIVE',
    realized_pnl: String(withdrawnUSD - depositUSD),
    remaining_qty: String(aumUSD),
    created_at: v.createdAt,
    updated_at: new Date().toISOString(),
  });
});

// List vault transactions (ledger entries)
vaultsRouter.get('/vaults/:name/transactions', (req, res) => {
  const name = String(req.params.name);
  const v = store.getVault(name);
  if (!v) return res.status(404).json({ error: 'not found' });
  res.json(store.getVaultEntries(name));
});

// Ledger holdings summary for a vault
vaultsRouter.get('/vaults/:name/holdings', async (req, res) => {
  const name = String(req.params.name);
  const v = store.getVault(name);
  if (!v) return res.status(404).json({ error: 'not found' });
  const entries = store.getVaultEntries(name);
  const stats = await store.vaultStats(name);
  const total_aum = stats.aumUSD;
  const price_per_share = 1; // simple fixed PPS
  const total_shares = total_aum / price_per_share;
  const transaction_count = entries.length;
  const last_transaction_at = entries.reduce((m, e) => (m > e.at ? m : e.at), v.createdAt);
  res.json({ total_shares, total_aum, share_price: price_per_share, transaction_count, last_transaction_at });
});

// Deposit into a vault
vaultsRouter.post('/vaults/:name/deposit', async (req, res) => {
  try {
    const name = String(req.params.name);
    if (!store.getVault(name)) store.ensureVault(name);
    const payload = parseDepositPayload(req.body || {});
    const at = payload.at ?? new Date().toISOString();

    const entry: VaultEntry = {
      vault: name,
      type: 'DEPOSIT',
      asset: payload.asset,
      amount: payload.amount,
      usdValue: payload.usdValue,
      at,
      account: payload.account,
      note: payload.note,
    };
    store.addVaultEntry(entry);

    // No mirroring into Transactions - vault-only model
    res.status(201).json({ ok: true, entry });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'invalid deposit' });
  }
});

// Withdraw from a vault
vaultsRouter.post('/vaults/:name/withdraw', async (req, res) => {
  try {
    const name = String(req.params.name);
    if (!store.getVault(name)) store.ensureVault(name);
    const payload = parseWithdrawPayload(req.body || {});
    const entry: VaultEntry = {
      vault: name,
      type: 'WITHDRAW',
      asset: payload.asset,
      amount: payload.amount,
      usdValue: payload.usdValue,
      at: payload.at ?? new Date().toISOString(),
      account: payload.account,
      note: payload.note,
    };
    store.addVaultEntry(entry);
    res.status(201).json({ ok: true, entry });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'invalid withdraw' });
  }
});

// End vault (close)
vaultsRouter.post('/vaults/:name/end', (req, res) => {
  const name = String(req.params.name);
  const ok = store.endVault(name);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Delete vault
vaultsRouter.delete('/vaults/:name', (req, res) => {
  const name = String(req.params.name);
  const ok = store.deleteVault(name);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Manual refresh (compute ROI with provided current value)
vaultsRouter.post('/vaults/:name/refresh', async (req, res) => {
  const name = String(req.params.name);
  const v = store.getVault(name);
  if (!v) return res.status(404).json({ error: 'not found' });
  const stats = await store.vaultStats(name);
  const current_value_usd = Number(req.body?.current_value_usd ?? stats.aumUSD) || 0;
  const persist = String(req.body?.persist || '').toLowerCase() === 'true' || req.body?.persist === true;

  // If persist requested, record a VALUATION entry
  if (persist) {
    const at = new Date().toISOString();
    const asset = { type: 'FIAT', symbol: 'USD' } as const;
    store.addVaultEntry({
      vault: name,
      type: 'VALUATION',
      asset: asset as any,
      amount: 0,
      usdValue: current_value_usd,
      at,
      note: 'Manual valuation update',
    });
  }

  const roi_realtime_percent = stats.totalDepositedUSD > 0
    ? ((current_value_usd + stats.totalWithdrawnUSD - stats.totalDepositedUSD) / stats.totalDepositedUSD) * 100
    : 0;
  const resp = {
    as_of: new Date().toISOString(),
    current_value_usd,
    roi_realtime_percent,
    apr_percent: roi_realtime_percent, // simplistic
  };
  res.json(resp);
});

// Distribute a reward: mark valuation to include the gain, then move only the reward to a destination vault.
// Body:
//   {
//     amount: number,                  // reward USD
//     destination?: string,            // destination vault name (default 'Spend')
//     at?: string, date?: string,      // ISO datetime for entries
//     note?: string,                   // optional note
//     mark?: boolean,                  // default true; if true, persist valuation before distribution
//     new_total_usd?: number,          // optional explicit valuation total; defaults to current AUM + amount
//     create_income?: boolean          // if true, also record an INCOME transaction in destination for analytics
//   }
vaultsRouter.post('/vaults/:name/distribute-reward', async (req, res) => {
  try {
    const name = String(req.params.name);
    if (!store.getVault(name)) store.ensureVault(name);

    const amount = Number(req.body?.amount ?? req.body?.reward_usd ?? req.body?.reward ?? 0) || 0;
    if (!(amount > 0)) return res.status(400).json({ error: 'amount>0 required' });

    const destination = String(req.body?.destination ?? req.body?.dest ?? req.body?.target_account ?? 'Spend').trim() || 'Spend';
    if (!store.getVault(destination)) store.ensureVault(destination);

    const at: string = String(req.body?.at ?? req.body?.date ?? '') || new Date().toISOString();
    const note: string | undefined = req.body?.note ? String(req.body.note) : undefined;
    const shouldMark: boolean = req.body?.mark === false ? false : true;

    // Step 1: persist valuation so AUM includes the reward before distribution
    let marked_to: number | undefined = undefined;
    if (shouldMark) {
      const stats = await store.vaultStats(name);
      const intended = Number(req.body?.new_total_usd ?? 0) || (stats.aumUSD + amount);
      const asset = { type: 'FIAT', symbol: 'USD' } as const;
      store.addVaultEntry({
        vault: name,
        type: 'VALUATION',
        asset: asset as any,
        amount: 0,
        usdValue: intended,
        at,
        note: note ? `Valuation before reward: ${note}` : 'Valuation before reward',
      });
      marked_to = intended;
    }

    const usd = { type: 'FIAT', symbol: 'USD' } as const;

    // Step 2: withdraw only the reward from the source vault
    store.addVaultEntry({
      vault: name,
      type: 'WITHDRAW',
      asset: usd as any,
      amount: amount,
      usdValue: amount,
      at,
      note: note ?? 'Reward distribution',
    });

    // Step 3: deposit reward into destination vault
    store.addVaultEntry({
      vault: destination,
      type: 'DEPOSIT',
      asset: usd as any,
      amount: amount,
      usdValue: amount,
      at,
      note: `Reward from ${name}${note ? `: ${note}` : ''}`,
    });

    // Optional: create an INCOME transaction for analytics
    const createIncome = String(req.body?.create_income || '').toLowerCase() === 'true' || req.body?.create_income === true;
    if (createIncome) {
      await store.recordIncomeTx({
        asset: usd as any,
        amount,
        at,
        account: destination,
        note: `Reward from ${name}${note ? `: ${note}` : ''}`,
      });
    }

    res.status(201).json({ ok: true, source: name, destination, reward_usd: amount, marked_to });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Failed to distribute reward' });
  }
});
