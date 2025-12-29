/*
  Backfill empty transaction account fields to the default spending vault.
  - Backs up data/store.json to data/store.json.bak-<timestamp>
  - Ensures default spending vault exists (uses store.getDefaultSpendingVaultName())
  - Sets tx.account = <defaultSpendingVault> when account is missing/blank

  Usage:
    npm run migrate:backfill-spending-vault
*/

import fs from 'fs';
import path from 'path';
import { settingsRepository } from '../repositories';

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

function backupFile(src: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${src}.bak-${timestamp}`;
  fs.copyFileSync(src, dest);
  return dest;
}

function run() {
  if (!fs.existsSync(STORE_FILE)) {
    console.error('Store file not found at', STORE_FILE);
    process.exit(1);
  }

  // Ensure spending vault exists and get its name
  const spendingVault = settingsRepository.getDefaultSpendingVaultName();
  console.log('Default spending vault:', spendingVault);

  const raw = fs.readFileSync(STORE_FILE, 'utf8');
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse store.json:', (e as any)?.message || e);
    process.exit(1);
  }

  const backupPath = backupFile(STORE_FILE);
  console.log('Backed up current store to', backupPath);

  if (!data || typeof data !== 'object') data = {};
  if (!Array.isArray(data.transactions)) data.transactions = [];
  if (!data.settings || typeof data.settings !== 'object') data.settings = {};

  let updated = 0;
  for (const tx of data.transactions) {
    const acc = (tx?.account ?? '').toString().trim();
    if (!acc) {
      tx.account = spendingVault;
      updated++;
    }
  }

  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
  console.log(`Updated ${updated} transactions with missing account -> '${spendingVault}'.`);
  console.log('Done.');
}

run();

