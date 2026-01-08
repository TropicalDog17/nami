import { Asset, Vault, VaultEntry, assetKey } from "../types";
import { vaultRepository } from "../repositories";
import { settingsRepository } from "../repositories";
import { transactionRepository } from "../repositories";
import { priceService } from "./price.service";

export interface VaultStats {
  totalDepositedUSD: number;
  totalWithdrawnUSD: number;
  aumUSD: number;
  aumUSDManual: number;
  aumUSDMarket: number;
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

    // Track positions separately for USD and other assets
    const positions = new Map<string, { asset: Asset; units: number }>();
    let lastValuationUSD: number | undefined = undefined;
    let netFlowSinceValUSD = 0;
    let netFlowSinceValNonUSD = 0;

    for (const e of entries) {
      if (e.type === "DEPOSIT") {
        const usd = Number(e.usdValue || 0);
        deposited += usd;
        const k = assetKey(e.asset);
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units += e.amount;
        positions.set(k, cur);

        if (e.asset.symbol === "USD") {
          if (typeof lastValuationUSD === "number") netFlowSinceValUSD += usd;
        } else {
          if (typeof lastValuationUSD === "number")
            netFlowSinceValNonUSD += usd;
        }
      } else if (e.type === "WITHDRAW") {
        const usd = Number(e.usdValue || 0);
        withdrawn += usd;
        const k = assetKey(e.asset);
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units -= e.amount;
        positions.set(k, cur);

        // Reward distributions don't reduce AUM - they're profit withdrawals
        const isRewardDistribution = e.note?.toLowerCase().includes("reward distribution");
        if (!isRewardDistribution) {
          if (e.asset.symbol === "USD") {
            if (typeof lastValuationUSD === "number") netFlowSinceValUSD -= usd;
          } else {
            if (typeof lastValuationUSD === "number")
              netFlowSinceValNonUSD -= usd;
          }
        }
      } else if (e.type === "VALUATION") {
        if (typeof e.usdValue === "number") lastValuationUSD = e.usdValue;
        netFlowSinceValUSD = 0;
        netFlowSinceValNonUSD = 0;
      }
    }

    // Compute AUM
    let aumManual = 0;
    let aumMarket = 0;

    if (typeof lastValuationUSD === "number") {
      aumManual = lastValuationUSD + netFlowSinceValUSD;
    } else {
      const usdPosition = positions.get("FIAT:USD");
      if (usdPosition) {
        aumManual = usdPosition.units;
      }
    }

    for (const v of positions.values()) {
      if (Math.abs(v.units) < 1e-12) continue;
      if (v.asset.symbol === "USD") continue;
      const rate = await priceService.getRateUSD(v.asset);
      aumMarket += v.units * rate.rateUSD;
    }

    return {
      totalDepositedUSD: deposited,
      totalWithdrawnUSD: withdrawn,
      aumUSD: aumManual + aumMarket,
      aumUSDManual: aumManual,
      aumUSDMarket: aumMarket,
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

  /**
   * Transfer between vaults - creates a WITHDRAW from source and DEPOSIT to destination
   */
  async transferBetweenVaults(params: {
    fromVault: string;
    toVault: string;
    asset: Asset;
    amount: number;
    usdValue: number;
    at?: string;
    note?: string;
  }): Promise<{ withdrawEntry: VaultEntry; depositEntry: VaultEntry }> {
    const { fromVault, toVault, asset, amount, usdValue, note } = params;
    const at = params.at ?? new Date().toISOString();

    // Ensure both vaults exist
    this.ensureVault(fromVault);
    this.ensureVault(toVault);

    // Create WITHDRAW entry from source vault
    const withdrawEntry: VaultEntry = {
      vault: fromVault,
      type: "WITHDRAW",
      asset,
      amount,
      usdValue,
      at,
      account: toVault, // destination vault as account reference
      note: note ?? `Transfer to ${toVault}`,
    };

    // Create DEPOSIT entry to destination vault
    const depositEntry: VaultEntry = {
      vault: toVault,
      type: "DEPOSIT",
      asset,
      amount,
      usdValue,
      at,
      account: fromVault, // source vault as account reference
      note: note ?? `Transfer from ${fromVault}`,
    };

    // Add both entries
    const createdWithdraw = this.addVaultEntry(withdrawEntry);
    const createdDeposit = this.addVaultEntry(depositEntry);

    return {
      withdrawEntry: createdWithdraw,
      depositEntry: createdDeposit,
    };
  }
}

export const vaultService = new VaultService();
