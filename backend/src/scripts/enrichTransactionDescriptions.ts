/*
  Enriches existing transactions that have no note or counterparty
  by generating descriptions based on available metadata.

  This is a one-time migration script to improve data quality before
  enforcing description requirements.

  - Backs up data/store.json to data/store.json.bak-<timestamp>
  - Generates descriptive notes for transactions with missing descriptions
  - Updates transactions in place

  Usage:
    npm run migrate:enrich-descriptions
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
  console.log("\nStarting transaction description enrichment...\n");

  if (!data || typeof data !== "object") data = {};
  if (!Array.isArray(data.transactions)) data.transactions = [];

  const updated: Array<{ id: string; before: string; after: string }> = [];

  for (const tx of data.transactions) {
    const hasNote = tx.note && tx.note.trim().length > 0;
    const hasCounterparty = tx.counterparty && tx.counterparty.trim().length > 0;
    const hasDescription = hasNote || hasCounterparty;

    if (!hasDescription) {
      let generatedNote = '';

      // Strategy: Use category > tag > type as base description
      if (tx.category) {
        generatedNote = `${tx.category} - ${(tx.type || 'transaction').toLowerCase()}`;
      } else if (tx.tag) {
        generatedNote = `${tx.tag} - ${(tx.type || 'transaction').toLowerCase()}`;
      } else if (tx.tags && Array.isArray(tx.tags) && tx.tags.length > 0) {
        generatedNote = `${tx.tags[0]} - ${(tx.type || 'transaction').toLowerCase()}`;
      } else {
        generatedNote = `${tx.type || 'Transaction'}`;
      }

      // Add date for additional context
      const dateStr = tx.createdAt
        ? new Date(tx.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
        : 'unknown date';
      generatedNote += ` (${dateStr})`;

      // Update transaction
      tx.note = generatedNote;

      updated.push({
        id: tx.id || 'unknown',
        before: 'No description',
        after: generatedNote
      });

      console.log(`✓ Updated ${tx.id || 'unknown'}: "${generatedNote}"`);
    }
  }

  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));

  console.log(`\n====================================`);
  console.log(`Summary: Enriched ${updated.length} transactions`);
  console.log(`====================================\n`);

  if (updated.length > 0) {
    console.log("Sample updates:");
    updated.slice(0, 5).forEach(u => {
      console.log(`  ${u.id}: "${u.before}" → "${u.after}"`);
    });
    if (updated.length > 5) {
      console.log(`  ... and ${updated.length - 5} more`);
    }
  }

  console.log("\n✓ Migration completed successfully");
}

run();
