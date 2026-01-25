import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { Asset, VaultEntry, Transaction } from "../types";
import { vaultService } from "../services/vault.service";
import { priceService } from "../services/price.service";
import { transactionRepository } from "../repositories";
import { createAssetFromSymbol } from "../utils/asset.util";

export const vaultsRouter = Router();

// Helper to get rate for cons-vaults deposit/withdraw
async function getRate(asset: Asset, at?: string) {
  return priceService.getRateUSD(asset, at);
}

// Helper to create tokenized vault shape (for cons-vaults compatibility)
function toTokenizedShape(v: {
  name: string;
  status: "ACTIVE" | "CLOSED";
  createdAt: string;
}) {
  const now = new Date().toISOString();
  return vaultService.vaultStats(v.name).then((stats) => {
    const aum = stats.aumUSD;
    const depositUSD = stats.totalDepositedUSD;
    const withdrawnUSD = stats.totalWithdrawnUSD;
    // ROI = (Current Value + Withdrawn - Invested) / Invested
    const perfPct =
      depositUSD > 0
        ? ((aum + withdrawnUSD - depositUSD) / depositUSD) * 100
        : 0;
    // Shares issued = net contributed (deposits - withdrawals at $1/share initial price)
    const netContributed = depositUSD - withdrawnUSD;
    const supply = netContributed > 0 ? netContributed : 0;
    // Price = AUM / supply (how much each share is worth now)
    const price = supply > 0 ? aum / supply : 1;
    return {
      id: v.name,
      name: v.name,
      description: "",
      type: "user_defined",
      status: v.status === "ACTIVE" ? "active" : "closed",
      token_symbol: v.name.slice(0, 8).toUpperCase(),
      token_decimals: 2,
      total_supply: String(supply),
      total_assets_under_management: String(aum),
      current_share_price: String(price.toFixed(4)),
      initial_share_price: "1",
      is_user_defined_price: true,
      manual_price_per_share: String(price.toFixed(4)),
      price_last_updated_by: "system",
      price_last_updated_at: now,
      price_update_notes: "",
      is_deposit_allowed: true,
      is_withdrawal_allowed: true,
      min_deposit_amount: "0",
      min_withdrawal_amount: "0",
      inception_date: v.createdAt,
      last_updated: now,
      performance_since_inception: String(perfPct),
      created_by: "local",
      created_at: v.createdAt,
      updated_at: now,
    };
  });
}

function parseDepositPayload(body: any): {
  asset: Asset;
  amount: number;
  usdValue: number;
  at?: string;
  account?: string;
  note?: string;
} {
  const at: string | undefined =
    body.at || (typeof body.date === "string" ? body.date : undefined);
  const account: string | undefined =
    body.account || body.sourceAccount || undefined;
  const note: string | undefined = body.note || undefined;

  const assetSym = (body.asset?.symbol || body.asset || "USD")
    .toString()
    .toUpperCase();
  const asset: Asset = createAssetFromSymbol(assetSym);
  const quantity = Number(body.quantity ?? body.amount ?? 0) || 0;
  const cost = Number(body.cost ?? body.value ?? body.usdValue ?? 0) || 0;

  if (asset.symbol === "USD") {
    const usdValue = cost > 0 ? cost : quantity;
    return { asset, amount: usdValue, usdValue, at, account, note };
  }

  if (!(quantity > 0) || !(cost > 0)) {
    throw new Error("quantity and cost required for non-USD deposit");
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
  const at: string | undefined =
    body.at || (typeof body.date === "string" ? body.date : undefined);
  const account: string | undefined =
    body.account ||
    body.targetAccount ||
    body.target_account ||
    body.to ||
    body.destination ||
    body.target ||
    undefined;
  const note: string | undefined = body.note || undefined;

  const assetSym = (body.asset?.symbol || body.asset || "USD")
    .toString()
    .toUpperCase();
  const asset: Asset = createAssetFromSymbol(assetSym);
  const quantity = Number(body.quantity ?? body.amount ?? 0) || 0;
  const value = Number(body.value ?? body.usdValue ?? 0) || 0;

  if (asset.symbol === "USD") {
    const usdValue = value > 0 ? value : quantity;
    return { asset, amount: usdValue, usdValue, at, account, note };
  }

  if (!(quantity > 0) || !(value > 0)) {
    throw new Error("quantity and value required for non-USD withdraw");
  }

  return { asset, amount: quantity, usdValue: value, at, account, note };
}

// Create or ensure a vault exists
vaultsRouter.post("/vaults", (req: Request, res: Response) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });

  const created = vaultService.ensureVault(name);
  res.status(created ? 201 : 200).json(vaultService.getVault(name));
});

// List vaults
vaultsRouter.get("/vaults", async (req: Request, res: Response) => {
  const isOpen = String(req.query.is_open || "").toLowerCase() === "true";
  const enrich = String(req.query.enrich || "").toLowerCase() === "true";
  const tokenized = String(req.query.tokenized || "").toLowerCase() === "true";

  const list = vaultService
    .listVaults()
    .filter((v) => (isOpen ? v.status === "ACTIVE" : true));

  // Return tokenized shape if requested
  if (tokenized) {
    try {
      const shaped = await Promise.all(list.map(toTokenizedShape));
      return res.json(shaped);
    } catch (e: any) {
      return res
        .status(500)
        .json({ error: e?.message || "Failed to list vaults" });
    }
  }

  if (!enrich) return res.json(list);

  const enriched = await Promise.all(
    list.map(async (v) => {
      const stats = await vaultService.vaultStats(v.name);
      const depositUSD = stats.totalDepositedUSD;
      const withdrawnUSD = stats.totalWithdrawnUSD;
      const aumUSD = stats.aumUSD;
      const roi =
        depositUSD > 0
          ? ((aumUSD + withdrawnUSD - depositUSD) / depositUSD) * 100
          : 0;

      return {
        id: v.name,
        name: v.name,
        status: v.status.toLowerCase() === "active" ? "active" : "closed",
        inception_date: v.createdAt,
        total_contributed_usd: depositUSD,
        total_withdrawn_usd: withdrawnUSD,
        total_assets_under_management: aumUSD,
        total_usd_manual: stats.aumUSDManual,
        total_usd_market: stats.aumUSDMarket,
        current_share_price: 0,
        total_supply: 0,
        roi_realtime_percent: roi,
      };
    }),
  );

  res.json(enriched);
});

// Get single vault
vaultsRouter.get("/vaults/:name", async (req: Request, res: Response) => {
  const name = String(req.params.name);
  const vault = vaultService.getVault(name);
  if (!vault) return res.status(404).json({ error: "not found" });

  // Return tokenized shape if requested
  const tokenized = String(req.query.tokenized || "").toLowerCase() === "true";
  if (tokenized) {
    const shaped = await toTokenizedShape(vault);
    return res.json(shaped);
  }

  const stats = await vaultService.vaultStats(name);
  const depositUSD = stats.totalDepositedUSD;
  const withdrawnUSD = stats.totalWithdrawnUSD;
  const aumUSD = stats.aumUSD;
  const roi =
    depositUSD > 0
      ? ((aumUSD + withdrawnUSD - depositUSD) / depositUSD) * 100
      : 0;
  const firstEntry = vaultService.getVaultEntries(name)[0];

  res.json({
    id: vault.name,
    is_vault: true,
    vault_name: vault.name,
    vault_status: vault.status === "ACTIVE" ? "active" : "closed",
    vault_ended_at: vault.status === "CLOSED" ? vault.createdAt : undefined,
    asset: "USD",
    account: vault.name,
    deposit_date: firstEntry?.at ?? vault.createdAt,
    deposit_qty: String(depositUSD),
    deposit_cost: String(depositUSD),
    deposit_unit_cost: "1",
    withdrawal_qty: String(withdrawnUSD),
    withdrawal_value: String(withdrawnUSD),
    withdrawal_unit_price: "1",
    pnl: String(aumUSD + withdrawnUSD - depositUSD),
    pnl_percent: String(roi),
    is_open: vault.status === "ACTIVE",
    realized_pnl: String(withdrawnUSD - depositUSD),
    remaining_qty: String(aumUSD),
    total_usd_manual: stats.aumUSDManual,
    total_usd_market: stats.aumUSDMarket,
    created_at: vault.createdAt,
    updated_at: new Date().toISOString(),
  });
});

// List vault transactions
vaultsRouter.get(
  "/vaults/:name/transactions",
  (req: Request, res: Response) => {
    const name = String(req.params.name);
    const vault = vaultService.getVault(name);
    if (!vault) return res.status(404).json({ error: "not found" });

    res.json(vaultService.getVaultEntries(name));
  },
);

// Vault holdings summary
vaultsRouter.get(
  "/vaults/:name/holdings",
  async (req: Request, res: Response) => {
    const name = String(req.params.name);
    const vault = vaultService.getVault(name);
    if (!vault) return res.status(404).json({ error: "not found" });

    const entries = vaultService.getVaultEntries(name);
    const stats = await vaultService.vaultStats(name);
    const total_aum = stats.aumUSD;
    const price_per_share = 1;
    const total_shares = total_aum / price_per_share;
    const transaction_count = entries.length;
    const last_transaction_at = entries.reduce(
      (m, e) => (m > e.at ? m : e.at),
      vault.createdAt,
    );

    res.json({
      total_shares,
      total_aum,
      total_usd_manual: stats.aumUSDManual,
      total_usd_market: stats.aumUSDMarket,
      share_price: price_per_share,
      transaction_count,
      last_transaction_at,
    });
  },
);

// Deposit into vault
vaultsRouter.post(
  "/vaults/:name/deposit",
  async (req: Request, res: Response) => {
    try {
      const name = String(req.params.name);
      if (!vaultService.getVault(name)) vaultService.ensureVault(name);

      const payload = parseDepositPayload(req.body || {});
      const at = payload.at ?? new Date().toISOString();

      const entry: VaultEntry = {
        vault: name,
        type: "DEPOSIT",
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
      res.status(400).json({ error: e?.message || "invalid deposit" });
    }
  },
);

// Withdraw from vault
vaultsRouter.post(
  "/vaults/:name/withdraw",
  async (req: Request, res: Response) => {
    try {
      const name = String(req.params.name);
      if (!vaultService.getVault(name)) vaultService.ensureVault(name);

      const payload = parseWithdrawPayload(req.body || {});
      const entry: VaultEntry = {
        vault: name,
        type: "WITHDRAW",
        asset: payload.asset,
        amount: payload.amount,
        usdValue: payload.usdValue,
        at: payload.at ?? new Date().toISOString(),
        account: payload.account,
        note: payload.note,
      };

      const toVault = String(
        req.body?.to ??
          req.body?.destination ??
          req.body?.target_account ??
          req.body?.targetAccount ??
          "",
      ).trim();

      if (toVault) {
        if (toVault === name) {
          return res
            .status(400)
            .json({ error: "cannot transfer to the same vault" });
        }

        const result = await vaultService.transferBetweenVaults({
          fromVault: name,
          toVault,
          asset: entry.asset,
          amount: entry.amount,
          usdValue: entry.usdValue,
          at: entry.at,
          note: entry.note,
        });

        return res.status(201).json({
          ok: true,
          entry: result.withdrawEntry,
          withdrawEntry: result.withdrawEntry,
          depositEntry: result.depositEntry,
        });
      }

      vaultService.addVaultEntry(entry);
      return res.status(201).json({ ok: true, entry });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "invalid withdraw" });
    }
  },
);

// End vault
vaultsRouter.post("/vaults/:name/end", (req: Request, res: Response) => {
  const name = String(req.params.name);
  const ok = vaultService.endVault(name);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Delete vault
vaultsRouter.delete("/vaults/:name", (req: Request, res: Response) => {
  const name = String(req.params.name);
  const ok = vaultService.deleteVault(name);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Manual refresh
vaultsRouter.post(
  "/vaults/:name/refresh",
  async (req: Request, res: Response) => {
    const name = String(req.params.name);
    const vault = vaultService.getVault(name);
    if (!vault) return res.status(404).json({ error: "not found" });

    const stats = await vaultService.vaultStats(name);
    const current_value_usd =
      Number(req.body?.current_value_usd ?? stats.aumUSDManual) || 0;
    const persist =
      String(req.body?.persist || "").toLowerCase() === "true" ||
      req.body?.persist === true;

    if (persist) {
      const at = new Date().toISOString();
      const asset = { type: "FIAT", symbol: "USD" } as const;
      vaultService.addVaultEntry({
        vault: name,
        type: "VALUATION",
        asset: asset as any,
        amount: 0,
        usdValue: current_value_usd,
        at,
        note: "Manual valuation update",
      });
    }

    const total_aum = current_value_usd + stats.aumUSDMarket;
    const roi_realtime_percent =
      stats.totalDepositedUSD > 0
        ? ((total_aum + stats.totalWithdrawnUSD - stats.totalDepositedUSD) /
            stats.totalDepositedUSD) *
          100
        : 0;

    const resp = {
      as_of: new Date().toISOString(),
      current_value_usd,
      current_value_market: stats.aumUSDMarket,
      total_aum,
      roi_realtime_percent,
      apr_percent: roi_realtime_percent,
    };

    res.json(resp);
  },
);

// Transfer between vaults
vaultsRouter.post(
  "/vaults/:name/transfer",
  async (req: Request, res: Response) => {
    try {
      const fromVault = String(req.params.name);
      const toVault = String(
        req.body?.to ?? req.body?.destination ?? req.body?.target ?? "",
      ).trim();

      if (!toVault) {
        return res
          .status(400)
          .json({ error: "destination vault (to) is required" });
      }

      if (fromVault === toVault) {
        return res
          .status(400)
          .json({ error: "cannot transfer to the same vault" });
      }

      // Parse asset and amount similar to deposit/withdraw
      const assetSym = (req.body?.asset?.symbol || req.body?.asset || "USD")
        .toString()
        .toUpperCase();
      const asset: Asset = createAssetFromSymbol(assetSym);

      const quantity = Number(req.body?.quantity ?? req.body?.amount ?? 0) || 0;
      const value =
        Number(req.body?.value ?? req.body?.usdValue ?? req.body?.cost ?? 0) ||
        0;

      let amount: number;
      let usdValue: number;

      if (asset.symbol === "USD") {
        amount = value > 0 ? value : quantity;
        usdValue = amount;
      } else {
        if (!(quantity > 0) || !(value > 0)) {
          return res.status(400).json({
            error: "quantity and value required for non-USD transfer",
          });
        }
        amount = quantity;
        usdValue = value;
      }

      if (!(amount > 0)) {
        return res.status(400).json({ error: "amount must be positive" });
      }

      const at: string | undefined =
        req.body?.at ||
        (typeof req.body?.date === "string" ? req.body.date : undefined);
      const note: string | undefined = req.body?.note || undefined;

      const result = await vaultService.transferBetweenVaults({
        fromVault,
        toVault,
        asset,
        amount,
        usdValue,
        at,
        note,
      });

      res.status(201).json({
        ok: true,
        from: fromVault,
        to: toVault,
        asset,
        amount,
        usdValue,
        withdrawEntry: result.withdrawEntry,
        depositEntry: result.depositEntry,
      });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "transfer failed" });
    }
  },
);

// Distribute reward
vaultsRouter.post(
  "/vaults/:name/distribute-reward",
  async (req: Request, res: Response) => {
    try {
      const name = String(req.params.name);
      if (!vaultService.getVault(name)) vaultService.ensureVault(name);

      const amount =
        Number(
          req.body?.amount ?? req.body?.reward_usd ?? req.body?.reward ?? 0,
        ) || 0;
      if (!(amount > 0))
        return res.status(400).json({ error: "amount>0 required" });

      const destination =
        String(
          req.body?.destination ??
            req.body?.dest ??
            req.body?.target_account ??
            "Spend",
        ).trim() || "Spend";
      if (!vaultService.getVault(destination))
        vaultService.ensureVault(destination);

      const at: string =
        String(req.body?.at ?? req.body?.date ?? "") ||
        new Date().toISOString();
      const note: string | undefined = req.body?.note
        ? String(req.body.note)
        : undefined;
      const shouldMark: boolean = req.body?.mark === false ? false : true;

      let marked_to: number | undefined = undefined;
      if (shouldMark) {
        const stats = await vaultService.vaultStats(name);
        const intended =
          Number(req.body?.new_total_usd ?? 0) || stats.aumUSDManual;
        const asset = { type: "FIAT", symbol: "USD" } as const;
        vaultService.addVaultEntry({
          vault: name,
          type: "VALUATION",
          asset: asset as any,
          amount: 0,
          usdValue: intended,
          at,
          note: note
            ? `Valuation before reward: ${note}`
            : "Valuation before reward",
        });
        marked_to = intended;
      }

      const usd = { type: "FIAT", symbol: "USD" } as const;

      vaultService.addVaultEntry({
        vault: name,
        type: "WITHDRAW",
        asset: usd as any,
        amount: amount,
        usdValue: amount,
        at,
        note: note ?? "Reward distribution",
      });

      vaultService.addVaultEntry({
        vault: destination,
        type: "DEPOSIT",
        asset: usd as any,
        amount: amount,
        usdValue: amount,
        at,
        note: `Reward from ${name}${note ? `: ${note}` : ""}`,
      });

      const createIncome =
        String(req.body?.create_income || "").toLowerCase() === "true" ||
        req.body?.create_income === true;
      if (createIncome) {
        await vaultService.recordIncomeTx({
          asset: usd as any,
          amount,
          at,
          account: destination,
          note: `Reward from ${name}${note ? `: ${note}` : ""}`,
        });
      }

      res.status(201).json({
        ok: true,
        source: name,
        destination,
        reward_usd: amount,
        marked_to,
      });
    } catch (e: any) {
      res.status(400).json({
        error: e?.message || "Failed to distribute reward",
      });
    }
  },
);

// Update vault (no-op minimal)
vaultsRouter.put("/vaults/:id", (_req, res) => {
  res.json({ ok: true });
});

// Delete vault (tokenized vaults endpoint - mirrors /vaults/:name endpoint)
vaultsRouter.delete("/vaults/:id", (req, res) => {
  const id = String(req.params.id);
  const ok = vaultService.deleteVault(id);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Close vault
vaultsRouter.post("/vaults/:id/close", (req, res) => {
  const id = String(req.params.id);
  const ok = vaultService.endVault(id);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Enable/disable manual pricing (no-op)
vaultsRouter.post("/vaults/:id/enable-manual-pricing", (_req, res) => {
  res.json({ ok: true });
});
vaultsRouter.post("/vaults/:id/disable-manual-pricing", (_req, res) => {
  res.json({ ok: true });
});

// Update price (no-op returns current computed)
vaultsRouter.post("/vaults/:id/update-price", async (req, res) => {
  const id = String(req.params.id);
  const v = vaultService.getVault(id);
  if (!v) return res.status(404).json({ error: "not found" });
  const shaped = await toTokenizedShape(v);
  res.json({
    current_share_price: shaped.current_share_price,
    total_assets_under_management: shaped.total_assets_under_management,
  });
});

// Update total value
vaultsRouter.post("/vaults/:id/update-total-value", async (req, res) => {
  const id = String(req.params.id);
  const v = vaultService.getVault(id);
  if (!v) return res.status(404).json({ error: "not found" });
  const totalValue = Number(req.body?.total_value || 0) || 0;
  const notes = req.body?.notes ? String(req.body.notes) : undefined;
  const at = new Date().toISOString();
  const asset: Asset = { type: "FIAT", symbol: "USD" };

  // Record a valuation entry so reporting/ROI uses this point-in-time total value
  vaultService.addVaultEntry({
    vault: id,
    type: "VALUATION",
    asset,
    amount: 0, // informational entry
    usdValue: totalValue,
    at,
    note: notes ? `Valuation: ${notes}` : "Valuation",
  });

  // Return updated price based on new AUM
  const shaped = await toTokenizedShape(v);
  res.json({
    current_share_price: shaped.current_share_price,
    total_assets_under_management: String(totalValue),
  });
});

// Deposit (tokenized vaults style with source_account transfer support)
vaultsRouter.post("/vaults/:id/deposit", async (req, res) => {
  const id = String(req.params.id);
  if (!vaultService.getVault(id)) vaultService.ensureVault(id);
  const amount = Number(req.body?.amount || 0) || 0;
  const notes = req.body?.notes ? String(req.body.notes) : undefined;
  const source = req.body?.source_account
    ? String(req.body.source_account)
    : undefined;

  if (!(amount > 0))
    return res.status(400).json({ error: "amount>0 required" });

  const at = new Date().toISOString();
  const assetSym = (req.body?.asset?.symbol || req.body?.asset || "USD")
    .toString()
    .toUpperCase();
  const asset: Asset = createAssetFromSymbol(assetSym);

  // Get rate first to compute USD value correctly
  const rate = await getRate(asset, at);
  const usdValue = amount * rate.rateUSD;

  vaultService.addVaultEntry({
    vault: id,
    type: "DEPOSIT",
    asset,
    amount,
    usdValue,
    at,
    account: source,
    note: notes,
  });
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
      usdAmount: amount * rate.rateUSD,
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
      usdAmount: amount * rate.rateUSD,
    } as Transaction;

    transactionRepository.create(txOut);
    transactionRepository.create(txIn);
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
      usdAmount: amount * rate.rateUSD,
    } as Transaction;
    transactionRepository.create(tx);
  }

  res.status(201).json({ ok: true });
});

// Withdraw (tokenized vaults style)
vaultsRouter.post("/vaults/:id/withdraw", async (req, res) => {
  const id = String(req.params.id);
  if (!vaultService.getVault(id)) vaultService.ensureVault(id);
  const amount = Number(req.body?.amount || 0) || 0;
  const notes = req.body?.notes ? String(req.body.notes) : undefined;
  if (!(amount > 0))
    return res.status(400).json({ error: "amount>0 required" });

  const at = new Date().toISOString();
  const assetSym = (req.body?.asset?.symbol || req.body?.asset || "USD")
    .toString()
    .toUpperCase();
  const asset: Asset = createAssetFromSymbol(assetSym);

  // Get rate first to compute USD value correctly
  const rate = await getRate(asset, at);
  const usdValue = amount * rate.rateUSD;

  vaultService.addVaultEntry({
    vault: id,
    type: "WITHDRAW",
    asset,
    amount,
    usdValue,
    at,
    note: notes,
  });
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
    usdAmount: amount * rate.rateUSD,
  } as Transaction;

  transactionRepository.create(tx);

  res.status(201).json({ ok: true });
});
