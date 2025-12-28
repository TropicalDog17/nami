/**
 * Migrate Income vault to Spend vault
 * - Backs up store.json
 * - Moves all Income vault entries to Spend
 * - Deletes Income vault
 * - Updates settings
 *
 * Usage: npm run migrate:income-to-spend
 */

import { readStore, writeStore } from '../repositories/base.repository';
import { settingsRepository } from '../repositories/settings.repository';
import * as fs from 'fs';
import * as path from 'path';

async function migrateIncomeToSpend() {
  console.log('=== Income to Spend Vault Migration ===\n');

  const store = readStore();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(__dirname, '../../data', `store.json.bak-income-migration-${timestamp}`);

  // Step 1: Backup
  console.log('Step 1: Creating backup...');
  fs.copyFileSync(
    path.join(__dirname, '../../data/store.json'),
    backupPath
  );
  console.log(`✅ Backup created: ${backupPath}\n`);

  // Step 2: Find Income vault entries
  console.log('Step 2: Finding Income vault entries...');
  const incomeEntries = store.vaultEntries.filter(e => e.vault === 'Income');
  console.log(`✅ Found ${incomeEntries.length} Income vault entries\n`);

  if (incomeEntries.length > 0) {
    console.log('Income vault entries to migrate:');
    incomeEntries.forEach(entry => {
      console.log(`  - ${entry.type} | ${entry.amount} ${entry.asset.symbol} | ${new Date(entry.at).toLocaleDateString()} | ${entry.note || 'No note'}`);
    });
    console.log('');
  }

  // Step 3: Move to Spend
  console.log('Step 3: Moving entries from Income to Spend...');
  store.vaultEntries = store.vaultEntries.map(e =>
    e.vault === 'Income' ? { ...e, vault: 'Spend' } : e
  );
  console.log(`✅ Moved ${incomeEntries.length} entries to Spend vault\n`);

  // Step 4: Delete Income vault
  console.log('Step 4: Removing Income vault...');
  const beforeCount = store.vaults.length;
  store.vaults = store.vaults.filter(v => v.name !== 'Income');
  const afterCount = store.vaults.length;

  if (beforeCount > afterCount) {
    console.log('✅ Income vault removed\n');
  } else {
    console.log('ℹ️  Income vault did not exist\n');
  }

  // Step 5: Ensure Spend vault exists
  console.log('Step 5: Ensuring Spend vault exists...');
  if (!store.vaults.find(v => v.name === 'Spend')) {
    store.vaults.push({
      name: 'Spend',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    });
    console.log('✅ Spend vault created\n');
  } else {
    console.log('ℹ️  Spend vault already exists\n');
  }

  // Step 6: Update settings
  console.log('Step 6: Updating settings...');
  if (!store.settings) store.settings = {};
  store.settings.defaultIncomeVaultName = 'Spend';
  store.settings.migratedIncomeToSpend = true;
  console.log('✅ Settings updated:\n');
  console.log('   - defaultIncomeVaultName: Spend');
  console.log('   - migratedIncomeToSpend: true\n');

  // Step 7: Save changes
  console.log('Step 7: Saving changes...');
  writeStore(store);
  console.log('✅ Changes saved to store.json\n');

  // Summary
  console.log('=== Migration Complete ===');
  console.log(`Migrated ${incomeEntries.length} vault entries from Income to Spend`);
  console.log(`Backup saved to: ${backupPath}`);
  console.log('\nAll income will now default to Spend vault.');
  console.log('To rollback, restore from backup file.');
}

migrateIncomeToSpend().catch((error) => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
