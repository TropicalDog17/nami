import { Asset, Vault, VaultEntry, assetKey } from "../types";
import { vaultRepository } from "../repositories";
import { settingsRepository } from "../repositories";
import { transactionRepository } from "../repositories";
import { priceService } from "./price.service";

export interface VaultStats {
  totalDepositedUSD: number;
  totalWithdrawnUSD: number;
  aumUSD: number;
}

export class VaultService {
  ensureVault(name: string): boolean {
    const existing = vaultRepository.findByName(name);
    if (existing) return false;

    const vault: Vault = {
      name,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };

    vaultRepository.create(vault);
    return true;
  }

  getVault(name: string): Vault | undefined {
    return vaultRepository.findByName(name);
  }

  listVaults(): Vault[] {
    return vaultRepository.findAll();
  }

  endVault(name: string): boolean {
    const vault = vaultRepository.findByName(name);
    if (!vault) return false;

    vaultRepository.update(name, { status: "CLOSED" });
    return true;
  }

  deleteVault(name: string): boolean {
    return vaultRepository.delete(name);
  }

  addVaultEntry(entry: VaultEntry): VaultEntry {
    return vaultRepository.createEntry(entry);
  }

  getVaultEntries(name: string): VaultEntry[] {
    return vaultRepository.findAllEntries(name);
  }

  async vaultStats(name: string): Promise<VaultStats> {
    const entries = vaultRepository.findAllEntries(name);

    let deposited = 0;
    let withdrawn = 0;

    // Track positions and support rolling AUM
    const positions = new Map<string, { asset: Asset; units: number }>();
    let lastValuationUSD: number | undefined = undefined;
    let netFlowSinceValUSD = 0;

    for (const e of entries) {
      if (e.type === "DEPOSIT") {
        const usd = Number(e.usdValue || 0);
        deposited += usd;
        const k = assetKey(e.asset);
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units += e.amount;
        positions.set(k, cur);
        if (typeof lastValuationUSD === "number") netFlowSinceValUSD += usd;
      } else if (e.type === "WITHDRAW") {
        const usd = Number(e.usdValue || 0);
        withdrawn += usd;
        const k = assetKey(e.asset);
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units -= e.amount;
        positions.set(k, cur);
        if (typeof lastValuationUSD === "number") netFlowSinceValUSD -= usd;
      } else if (e.type === "VALUATION") {
        if (typeof e.usdValue === "number") lastValuationUSD = e.usdValue;
        netFlowSinceValUSD = 0;
      }
    }

    // Compute AUM
    let aum = 0;
    if (typeof lastValuationUSD === "number") {
      aum = lastValuationUSD + netFlowSinceValUSD;
    } else {
      for (const v of positions.values()) {
        if (Math.abs(v.units) < 1e-12) continue;
        const rate = await priceService.getRateUSD(v.asset);
        aum += v.units * rate.rateUSD;
      }
    }

    return {
      totalDepositedUSD: deposited,
      totalWithdrawnUSD: withdrawn,
      aumUSD: aum,
    };
  }

  async recordIncomeTx(params: {
    asset: Asset;
    amount: number;
    at?: string;
    account?: string;
    note?: string;
  }): Promise<any> {
    const { asset, amount, at, account, note } = params;
    const createdAt = at ?? new Date().toISOString();
    const rate = await priceService.getRateUSD(asset, at);
    const acc =
      account?.trim() || settingsRepository.getDefaultSpendingVaultName();

    if (acc) this.ensureVault(acc);

    const tx: any = {
      id: require("uuid").v4(),
      type: "INCOME",
      asset,
      amount,
      createdAt,
      account: acc,
      note,
      rate,
      usdAmount: amount * rate.rateUSD,
    };

    transactionRepository.create(tx);
    return tx;
  }

  getDefaultSpendingVaultName(): string {
    return settingsRepository.getDefaultSpendingVaultName();
  }
}

export const vaultService = new VaultService();
