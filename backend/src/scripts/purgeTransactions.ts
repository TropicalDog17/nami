/*
  Purge all Transactions from the data store and keep only Vault entries.
  - Backs up data/store.json to data/store.json.bak-<timestamp>
  - Sets transactions: []
  - Optionally marks settings.migratedVaultOnly = true

  Usage:
    npm run purge:transactions
*/

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

function backupFile(src: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${src}.bak-${timestamp}`;
  fs.copyFileSync(src, dest);
  return dest;
}

function run() {
  if (!fs.existsSync(STORE_FILE)) {
    console.error("Store file not found at", STORE_FILE);
    process.exit(1);
  }

  const raw = fs.readFileSync(STORE_FILE, "utf8");
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse store.json:", (e as any)?.message || e);
    process.exit(1);
  }

  const backupPath = backupFile(STORE_FILE);
  console.log("Backed up current store to", backupPath);

  // Ensure shape
  if (!data || typeof data !== "object") data = {};
  if (!Array.isArray(data.vaultEntries)) data.vaultEntries = [];
  if (!Array.isArray(data.vaults)) data.vaults = [];

  // Purge transactions
  const before = Array.isArray(data.transactions)
    ? data.transactions.length
    : 0;
  data.transactions = [];

  // Mark settings.migratedVaultOnly = true
  if (!data.settings || typeof data.settings !== "object") data.settings = {};
  data.settings.migratedVaultOnly = true;

  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
  console.log(
    `Purged ${before} transactions. Kept ${data.vaultEntries.length} vault entries.`,
  );
  console.log("Done.");
}

run();
