#!/usr/bin/env ts-node-dev
/**
 * Migration script to transfer data from local backend to production
 *
 * Usage:
 *   # Export from local, import to production
 *   pnpm run migrate:to-prod --from http://localhost:8080 --to https://nami-backend.vercel.app
 *
 *   # Export only (saves to file)
 *   pnpm run migrate:to-prod --from http://localhost:8080 --export-only
 *
 *   # Import from file
 *   pnpm run migrate:to-prod --to https://nami-backend.vercel.app --import-file ./backup.json
 */

import axios from "axios";
import fs from "fs";
import path from "path";

interface MigrationArgs {
  from?: string;
  to?: string;
  exportOnly?: boolean;
  importFile?: string;
}

function parseArgs(): MigrationArgs {
  const args: MigrationArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--from":
        args.from = argv[++i];
        break;
      case "--to":
        args.to = argv[++i];
        break;
      case "--export-only":
        args.exportOnly = true;
        break;
      case "--import-file":
        args.importFile = argv[++i];
        break;
    }
  }

  return args;
}

async function exportData(sourceUrl: string): Promise<any> {
  console.log(`\n📤 Exporting data from ${sourceUrl}...`);

  const response = await axios.get(`${sourceUrl}/api/admin/export`);
  const data = response.data;

  console.log(`   ✓ Transactions: ${data.transactions?.length || 0}`);
  console.log(`   ✓ Vaults: ${data.vaults?.length || 0}`);
  console.log(`   ✓ Loans: ${data.loans?.length || 0}`);
  console.log(`   ✓ Types: ${data.types?.length || 0}`);
  console.log(`   ✓ Accounts: ${data.accounts?.length || 0}`);
  console.log(`   ✓ Assets: ${data.assets?.length || 0}`);
  console.log(`   ✓ Tags: ${data.tags?.length || 0}`);
  console.log(`   ✓ Pending Actions: ${data.pending_actions?.length || 0}`);

  return data;
}

async function importData(targetUrl: string, data: any): Promise<void> {
  console.log(`\n📥 Importing data to ${targetUrl}...`);

  const response = await axios.post(`${targetUrl}/api/admin/import`, data, {
    headers: { "Content-Type": "application/json" },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const stats = response.data.imported;
  console.log(`   ✓ Transactions imported: ${stats.transactions}`);
  console.log(`   ✓ Vaults imported: ${stats.vaults}`);
  console.log(`   ✓ Vault entries imported: ${stats.vault_entries}`);
  console.log(`   ✓ Loans imported: ${stats.loans}`);
  console.log(`   ✓ Types imported: ${stats.types}`);
  console.log(`   ✓ Accounts imported: ${stats.accounts}`);
  console.log(`   ✓ Assets imported: ${stats.assets}`);
  console.log(`   ✓ Tags imported: ${stats.tags}`);
  console.log(`   ✓ Pending actions imported: ${stats.pending_actions}`);
}

async function main() {
  const args = parseArgs();

  console.log("🚀 Nami Data Migration Tool\n");

  // Validate arguments
  if (!args.from && !args.importFile) {
    console.error(
      "Error: --from <url> or --import-file <path> is required",
    );
    process.exit(1);
  }

  if (!args.to && !args.exportOnly) {
    console.error("Error: --to <url> or --export-only is required");
    process.exit(1);
  }

  let data: any;

  // Export or load from file
  if (args.importFile) {
    console.log(`📁 Loading data from ${args.importFile}...`);
    const content = fs.readFileSync(args.importFile, "utf-8");
    data = JSON.parse(content);
    console.log(`   ✓ Loaded ${data.transactions?.length || 0} transactions`);
  } else if (args.from) {
    data = await exportData(args.from);
  }

  // Save to file if export-only
  if (args.exportOnly) {
    const filename = `nami-backup-${new Date().toISOString().split("T")[0]}.json`;
    const filepath = path.join(process.cwd(), filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`\n💾 Exported to ${filepath}`);
    return;
  }

  // Import to target
  if (args.to) {
    await importData(args.to, data);
    console.log("\n✅ Migration complete!");
  }
}

main().catch((err) => {
  console.error("\n❌ Migration failed:", err.message);
  if (err.response?.data) {
    console.error("   Server response:", err.response.data);
  }
  process.exit(1);
});
