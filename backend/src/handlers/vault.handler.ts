import { Router, Request, Response } from 'express';
import { Asset, VaultEntry } from '../types';
import { vaultService } from '../services/vault.service';
import { priceService } from '../services/price.service';

export const vaultsRouter = Router();

// Helpers
async function computeUSD(asset: Asset, amount: number, at?: string): Promise<number> {
  const rate = await priceService.getRateUSD(asset, at);
  return amount * rate.rateUSD;
}

function parseDepositPayload(body: any): {
  asset: Asset;
  amount: number;
  usdValue: number;
  at?: string;
  account?: string;
  note?: string;
} {
  const at: string | undefined = body.at || (typeof body.date === 'string' ? body.date : undefined);
  const account: string | undefined = body.account || body.sourceAccount || undefined;
  const note: string | undefined = body.note || undefined;

  const assetSym = (body.asset?.symbol || body.asset || 'USD').toString().toUpperCase();
  const assetType = assetSym.length === 3 ? 'FIAT' : 'CRYPTO';
  const asset: Asset = { type: assetType as any, symbol: assetSym };
  const quantity = Number(body.quantity ?? body.amount ?? 0) || 0;
  const cost = Number(body.cost ?? body.value ?? body.usdValue ?? 0) || 0;

  if (asset.symbol === 'USD') {
    const usdValue = cost > 0 ? cost : quantity;
    return { asset, amount: usdValue, usdValue, at, account, note };
  }

  if (!(quantity > 0) || !(cost > 0)) {
    throw new Error('quantity and cost required for non-USD deposit');
  }

  return { asset, amount: quantity, usdValue: cost, at, account, note };
}

function parseWithdrawPayload(body: any): {
  asset: Asset;
  amount: number;
  usdValue: number;
  at?: string;
  account?: string;
  note?: string;
} {
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

  if (!(quantity > 0) || !(value > 0)) {
    throw new Error('quantity and value required for non-USD withdraw');
  }

  return { asset, amount: quantity, usdValue: value, at, account, note };
}

// Create or ensure a vault exists
vaultsRouter.post('/vaults', (req: Request, res: Response) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const created = vaultService.ensureVault(name);
  res.status(created ? 201 : 200).json(vaultService.getVault(name));
});

// List vaults
vaultsRouter.get('/vaults', async (req: Request, res: Response) => {
  const isOpen = String(req.query.is_open || '').toLowerCase() === 'true';
  const enrich = String(req.query.enrich || '').toLowerCase() === 'true';

  const list = vaultService.listVaults().filter(v => (isOpen ? v.status === 'ACTIVE' : true));

  if (!enrich) return res.json(list);

  const enriched = await Promise.all(list.map(async (v) => {
    const stats = await vaultService.vaultStats(v.name);
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

// Get single vault
vaultsRouter.get('/vaults/:name', async (req: Request, res: Response) => {
  const name = String(req.params.name);
  const vault = vaultService.getVault(name);
  if (!vault) return res.status(404).json({ error: 'not found' });

  const stats = await vaultService.vaultStats(name);
  const depositUSD = stats.totalDepositedUSD;
  const withdrawnUSD = stats.totalWithdrawnUSD;
  const aumUSD = stats.aumUSD;
  const roi = depositUSD > 0 ? ((aumUSD + withdrawnUSD - depositUSD) / depositUSD) * 100 : 0;
  const firstEntry = vaultService.getVaultEntries(name)[0];

  res.json({
    id: vault.name,
    is_vault: true,
    vault_name: vault.name,
    vault_status: vault.status === 'ACTIVE' ? 'active' : 'closed',
    vault_ended_at: vault.status === 'CLOSED' ? vault.createdAt : undefined,
    asset: 'USD',
    account: vault.name,
    deposit_date: firstEntry?.at ?? vault.createdAt,
    deposit_qty: String(depositUSD),
    deposit_cost: String(depositUSD),
    deposit_unit_cost: '1',
    withdrawal_qty: String(withdrawnUSD),
    withdrawal_value: String(withdrawnUSD),
    withdrawal_unit_price: '1',
    pnl: String(aumUSD + withdrawnUSD - depositUSD),
    pnl_percent: String(roi),
    is_open: vault.status === 'ACTIVE',
    realized_pnl: String(withdrawnUSD - depositUSD),
    remaining_qty: String(aumUSD),
    created_at: vault.createdAt,
    updated_at: new Date().toISOString(),
  });
});

// List vault transactions
vaultsRouter.get('/vaults/:name/transactions', (req: Request, res: Response) => {
  const name = String(req.params.name);
  const vault = vaultService.getVault(name);
  if (!vault) return res.status(404).json({ error: 'not found' });

  res.json(vaultService.getVaultEntries(name));
});

// Vault holdings summary
vaultsRouter.get('/vaults/:name/holdings', async (req: Request, res: Response) => {
  const name = String(req.params.name);
  const vault = vaultService.getVault(name);
  if (!vault) return res.status(404).json({ error: 'not found' });

  const entries = vaultService.getVaultEntries(name);
  const stats = await vaultService.vaultStats(name);
  const total_aum = stats.aumUSD;
  const price_per_share = 1;
  const total_shares = total_aum / price_per_share;
  const transaction_count = entries.length;
  const last_transaction_at = entries.reduce((m, e) => (m > e.at ? m : e.at), vault.createdAt);

  res.json({
    total_shares,
    total_aum,
    share_price: price_per_share,
    transaction_count,
    last_transaction_at
  });
});

// Deposit into vault
vaultsRouter.post('/vaults/:name/deposit', async (req: Request, res: Response) => {
  try {
    const name = String(req.params.name);
    if (!vaultService.getVault(name)) vaultService.ensureVault(name);

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

    vaultService.addVaultEntry(entry);
    res.status(201).json({ ok: true, entry });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'invalid deposit' });
  }
});

// Withdraw from vault
vaultsRouter.post('/vaults/:name/withdraw', async (req: Request, res: Response) => {
  try {
    const name = String(req.params.name);
    if (!vaultService.getVault(name)) vaultService.ensureVault(name);

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

    vaultService.addVaultEntry(entry);
    res.status(201).json({ ok: true, entry });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'invalid withdraw' });
  }
});

// End vault
vaultsRouter.post('/vaults/:name/end', (req: Request, res: Response) => {
  const name = String(req.params.name);
  const ok = vaultService.endVault(name);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Delete vault
vaultsRouter.delete('/vaults/:name', (req: Request, res: Response) => {
  const name = String(req.params.name);
  const ok = vaultService.deleteVault(name);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Manual refresh
vaultsRouter.post('/vaults/:name/refresh', async (req: Request, res: Response) => {
  const name = String(req.params.name);
  const vault = vaultService.getVault(name);
  if (!vault) return res.status(404).json({ error: 'not found' });

  const stats = await vaultService.vaultStats(name);
  const current_value_usd = Number(req.body?.current_value_usd ?? stats.aumUSD) || 0;
  const persist = String(req.body?.persist || '').toLowerCase() === 'true' || req.body?.persist === true;

  if (persist) {
    const at = new Date().toISOString();
    const asset = { type: 'FIAT', symbol: 'USD' } as const;
    vaultService.addVaultEntry({
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
    apr_percent: roi_realtime_percent,
  };

  res.json(resp);
});

// Distribute reward
vaultsRouter.post('/vaults/:name/distribute-reward', async (req: Request, res: Response) => {
  try {
    const name = String(req.params.name);
    if (!vaultService.getVault(name)) vaultService.ensureVault(name);

    const amount = Number(req.body?.amount ?? req.body?.reward_usd ?? req.body?.reward ?? 0) || 0;
    if (!(amount > 0)) return res.status(400).json({ error: 'amount>0 required' });

    const destination = String(req.body?.destination ?? req.body?.dest ?? req.body?.target_account ?? 'Spend').trim() || 'Spend';
    if (!vaultService.getVault(destination)) vaultService.ensureVault(destination);

    const at: string = String(req.body?.at ?? req.body?.date ?? '') || new Date().toISOString();
    const note: string | undefined = req.body?.note ? String(req.body.note) : undefined;
    const shouldMark: boolean = req.body?.mark === false ? false : true;

    let marked_to: number | undefined = undefined;
    if (shouldMark) {
      const stats = await vaultService.vaultStats(name);
      const intended = Number(req.body?.new_total_usd ?? 0) || (stats.aumUSD + amount);
      const asset = { type: 'FIAT', symbol: 'USD' } as const;
      vaultService.addVaultEntry({
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

    vaultService.addVaultEntry({
      vault: name,
      type: 'WITHDRAW',
      asset: usd as any,
      amount: amount,
      usdValue: amount,
      at,
      note: note ?? 'Reward distribution',
    });

    vaultService.addVaultEntry({
      vault: destination,
      type: 'DEPOSIT',
      asset: usd as any,
      amount: amount,
      usdValue: amount,
      at,
      note: `Reward from ${name}${note ? `: ${note}` : ''}`,
    });

    const createIncome = String(req.body?.create_income || '').toLowerCase() === 'true' || req.body?.create_income === true;
    if (createIncome) {
      await vaultService.recordIncomeTx({
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
