import { describe, it, expect } from "vitest";

import { rowToVaultEntry, vaultEntryToRow } from "../src/repositories/base-db.repository";

describe("base-db.repository numeric coercion", () => {
  it("parses comma-formatted usd_value strings for vault entries", () => {
    const entry = rowToVaultEntry({
      vault: "Cash",
      type: "DEPOSIT",
      asset_type: "CRYPTO",
      asset_symbol: "XAU",
      amount: "0.964",
      usd_value: "4,181.63 ",
      at: "2025-12-16T07:49:17.299Z",
    });

    expect(entry.amount).toBeCloseTo(0.964, 6);
    expect(entry.usdValue).toBeCloseTo(4181.63, 2);
  });

  it("coerces vault entry numeric fields before writing to DB rows", () => {
    const row = vaultEntryToRow({
      vault: "Cash",
      type: "DEPOSIT",
      asset: { type: "CRYPTO", symbol: "XAU" },
      amount: "0.964" as unknown as number,
      usdValue: "4,181.63 " as unknown as number,
      at: "2025-12-16T07:49:17.299Z",
    });

    expect(row.amount).toBeCloseTo(0.964, 6);
    expect(row.usd_value).toBeCloseTo(4181.63, 2);
  });
});

