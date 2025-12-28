# Bank Statement Pipeline - Implementation Guide

## Quick Start

This guide provides step-by-step implementation tasks for building the bank statement processing pipeline.

## Prerequisites

1. Excel file at: `ai-service/data/SaoKeTK_29112025_28122025.xlsx`
2. Python 3.x with `openpyxl` installed (or Node.js with `xlsx`)
3. Working AI service with LLM integration
4. Backend API running
5. Frontend development environment

## Phase 1: Excel Parser (1-2 days)

### Task 1.1: Create Excel Parser Module

**File:** `ai-service/src/core/excelParser.ts`

```typescript
import * as XLSX from 'xlsx';

export interface BankTransaction {
  date: string;           // "29/11/2025"
  remitter: string;       // Counterparty
  remitter_bank: string;  // Bank name
  details: string;        // Description
  transaction_no: string; // Reference ID
  debit: string;          // "52,000" or ""
  credit: string;         // "284" or ""
  balance: string;        // "2,978,361"
}

export interface BankStatementConfig {
  bank: string;
  headerRow: number;
  dataStartRow: number;
  columns: {
    date: number;
    remitter: number;
    remitterBank: number;
    details: number;
    transactionNo: number;
    debit: number;
    credit: number;
    balance: number;
  };
  skipPattern?: RegExp;
}

export function parseExcelBankStatement(
  filePath: string,
  config: BankStatementConfig
): BankTransaction[] {
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

  const transactions: BankTransaction[] = [];
  const skipPattern = config.skipPattern || /Số dư đầu kỳ|Phiếu này|Diễn giải/;

  for (let i = config.dataStartRow; i < rows.length; i++) {
    const row = rows[i] as any[];
    const dateVal = row[config.columns.date];

    // Skip invalid rows
    if (!dateVal || skipPattern.test(String(dateVal))) {
      continue;
    }

    // Check if it's a date
    if (!/\d{1,2}\/\d{1,2}\/\d{4}/.test(String(dateVal))) {
      continue;
    }

    transactions.push({
      date: String(row[config.columns.date] || '').trim(),
      remitter: String(row[config.columns.remitter] || '').trim(),
      remitter_bank: String(row[config.columns.remitterBank] || '').trim(),
      details: String(row[config.columns.details] || '').trim(),
      transaction_no: String(row[config.columns.transactionNo] || '').trim(),
      debit: String(row[config.columns.debit] || '').trim(),
      credit: String(row[config.columns.credit] || '').trim(),
      balance: String(row[config.columns.balance] || '').trim(),
    });
  }

  return transactions;
}

// Helper: Parse Vietnamese number format "52,000" -> 52000
export function parseVNDAmount(amount: string): number {
  return Number(amount.replace(/,/g, '')) || 0;
}

// Helper: Convert DD/MM/YYYY to YYYY-MM-DD
export function convertDateFormat(ddmmyyyy: string): string {
  const [day, month, year] = ddmmyyyy.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
```

### Task 1.2: Add Configuration

**File:** `ai-service/src/config/bankConfigs.ts`

```typescript
import { BankStatementConfig } from '../core/excelParser';

export const TECHCOMBANK_CONFIG: BankStatementConfig = {
  bank: 'techcombank',
  headerRow: 33,
  dataStartRow: 35,
  columns: {
    date: 1,
    remitter: 7,
    remitterBank: 16,
    details: 24,
    transactionNo: 32,
    debit: 45,
    credit: 53,
    balance: 59,
  },
  skipPattern: /Số dư đầu kỳ|Phiếu này|Diễn giải|Description/i
};
```

### Task 1.3: Write Tests

**File:** `ai-service/tests/excelParser.test.ts`

```typescript
import { parseExcelBankStatement, parseVNDAmount, convertDateFormat } from '../src/core/excelParser';
import { TECHCOMBANK_CONFIG } from '../src/config/bankConfigs';
import path from 'path';

describe('Excel Parser', () => {
  it('should parse Techcombank statement', () => {
    const filePath = path.join(__dirname, '../data/SaoKeTK_29112025_28122025.xlsx');
    const transactions = parseExcelBankStatement(filePath, TECHCOMBANK_CONFIG);

    expect(transactions.length).toBeGreaterThan(0);
    expect(transactions[0]).toHaveProperty('date');
    expect(transactions[0]).toHaveProperty('debit');
    expect(transactions[0]).toHaveProperty('credit');
  });

  it('should parse VND amounts correctly', () => {
    expect(parseVNDAmount('52,000')).toBe(52000);
    expect(parseVNDAmount('2,978,361')).toBe(2978361);
    expect(parseVNDAmount('284')).toBe(284);
  });

  it('should convert date format', () => {
    expect(convertDateFormat('29/11/2025')).toBe('2025-11-29');
    expect(convertDateFormat('01/12/2025')).toBe('2025-12-01');
  });
});
```

## Phase 2: AI Classification (2-3 days)

### Task 2.1: Create Classifier Module

**File:** `ai-service/src/core/bankStatementClassifier.ts`

```typescript
import { LLMClient } from '../integrations/llm';
import { BankTransaction, parseVNDAmount, convertDateFormat } from './excelParser';
import { AccountRef, TagRef } from './schemas';
import { createCorrelationLogger } from '../utils/logger';

export interface ClassifiedTransaction {
  date: string;              // "2025-11-29"
  type: 'INCOME' | 'EXPENSE';
  amount_vnd: number;        // 52000
  counterparty: string;      // "PVOIL HA NOI"
  category?: string;         // "fuel", "groceries", etc.
  note: string;              // Original details
  source_ref: string;        // Transaction number
  confidence: number;        // 0.0 - 1.0
}

export async function classifyBankTransaction(
  llmClient: LLMClient,
  transaction: BankTransaction,
  accounts: AccountRef[],
  tags: TagRef[],
  correlationId?: string
): Promise<ClassifiedTransaction> {
  const logger = createCorrelationLogger(correlationId);

  // Determine transaction type based on debit/credit
  const hasDebit = transaction.debit && parseVNDAmount(transaction.debit) > 0;
  const hasCredit = transaction.credit && parseVNDAmount(transaction.credit) > 0;

  const type: 'INCOME' | 'EXPENSE' = hasDebit ? 'EXPENSE' : 'INCOME';
  const amount_vnd = hasDebit
    ? parseVNDAmount(transaction.debit)
    : parseVNDAmount(transaction.credit);

  // Build AI prompt
  const availableTags = tags.map(t => t.name).join(', ');

  const systemPrompt = `You are a financial transaction analyzer for Vietnamese bank statements.
Your task is to extract and categorize transaction information.
Output ONLY a JSON object with no additional text.`;

  const userPrompt = `Analyze this Vietnamese bank transaction and extract information:

Transaction Details:
- Date: ${transaction.date}
- ${type === 'EXPENSE' ? 'Paid to' : 'Received from'}: ${transaction.remitter || 'Unknown'}
- Bank: ${transaction.remitter_bank || 'Unknown'}
- Description: ${transaction.details}
- Amount: ${amount_vnd.toLocaleString()} VND

Available categories: ${availableTags}

Output this exact JSON structure:
{
  "counterparty": "cleaned merchant/person name",
  "category": "best matching category from available list or null",
  "note": "brief English summary of the transaction",
  "confidence": 0.0-1.0
}`;

  const response = await llmClient.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], {
    temperature: 0.2,
    maxTokens: 300
  });

  // Parse AI response
  let aiData: any = {};
  try {
    const content = response.content.trim();
    // Extract JSON from code block if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    aiData = JSON.parse(jsonStr);
  } catch (e) {
    logger.warn({ error: e, response: response.content }, 'Failed to parse AI response');
    aiData = {
      counterparty: transaction.remitter || 'Unknown',
      category: null,
      note: transaction.details,
      confidence: 0.5
    };
  }

  return {
    date: convertDateFormat(transaction.date),
    type,
    amount_vnd,
    counterparty: aiData.counterparty || transaction.remitter || 'Unknown',
    category: aiData.category || undefined,
    note: aiData.note || transaction.details,
    source_ref: transaction.transaction_no,
    confidence: aiData.confidence || 0.7
  };
}

export async function classifyBatch(
  llmClient: LLMClient,
  transactions: BankTransaction[],
  accounts: AccountRef[],
  tags: TagRef[],
  batchSize: number = 10,
  correlationId?: string
): Promise<ClassifiedTransaction[]> {
  const logger = createCorrelationLogger(correlationId);
  const results: ClassifiedTransaction[] = [];

  logger.info({ total: transactions.length, batchSize }, 'Starting batch classification');

  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(tx => classifyBankTransaction(llmClient, tx, accounts, tags, correlationId))
    );
    results.push(...batchResults);

    logger.info({
      processed: results.length,
      total: transactions.length
    }, 'Batch classification progress');
  }

  return results;
}
```

### Task 2.2: Update Schemas

**File:** `ai-service/src/core/schemas.ts` (add to existing)

```typescript
// Add new action types
export const IncomeParamsSchema = z.object({
  account: z.string().min(1),
  vnd_amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  counterparty: z.string().nullable().optional(),
  tag: z.string().nullable().optional(),
  note: z.string().nullable().optional()
});

export const ActionRequestSchema = z.object({
  action: z.enum(['spend_vnd', 'credit_spend_vnd', 'income_vnd']),
  params: z.union([SpendParamsSchema, IncomeParamsSchema])
});

// Add bank statement source
export type PendingSource = 'telegram_text' | 'telegram_image' | 'bank_statement_excel';
```

## Phase 3: Batch Processor (2 days)

### Task 3.1: Create Batch Processor

**File:** `ai-service/src/api/batchProcessor.ts`

```typescript
import { v4 as uuidv4 } from 'uuid';
import { parseExcelBankStatement } from '../core/excelParser';
import { classifyBatch } from '../core/bankStatementClassifier';
import { createPendingAction, getGrounding } from './backendClient';
import { LLMClient } from '../integrations/llm';
import { AppConfig, loadConfig } from '../utils/config';
import { createCorrelationLogger } from '../utils/logger';
import { BankStatementConfig } from '../core/excelParser';

export interface BatchProcessResult {
  batchId: string;
  totalTransactions: number;
  processedCount: number;
  failedCount: number;
  pendingActionIds: string[];
  errors: Array<{ index: number; error: string }>;
}

export async function processBankStatementFile(
  filePath: string,
  bankConfig: BankStatementConfig,
  correlationId?: string
): Promise<BatchProcessResult> {
  const logger = createCorrelationLogger(correlationId);
  const config = loadConfig();
  const batchId = `bank_${bankConfig.bank}_${Date.now()}`;

  logger.info({ filePath, batchId }, 'Starting bank statement processing');

  // Step 1: Parse Excel
  const transactions = parseExcelBankStatement(filePath, bankConfig);
  logger.info({ count: transactions.length }, 'Parsed transactions from Excel');

  // Step 2: Get grounding data
  const grounding = await getGrounding(config, correlationId);
  logger.info({
    accounts: grounding.accounts.length,
    tags: grounding.tags.length
  }, 'Fetched grounding data');

  // Step 3: Classify with AI
  const llmClient = new LLMClient({}, correlationId);
  const classified = await classifyBatch(
    llmClient,
    transactions,
    grounding.accounts,
    grounding.tags,
    10,
    correlationId
  );

  logger.info({ count: classified.length }, 'Classified transactions');

  // Step 4: Create pending actions
  const pendingActionIds: string[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < classified.length; i++) {
    const ct = classified[i];
    const original = transactions[i];

    try {
      // Determine action type
      const action = ct.type === 'EXPENSE' ? 'spend_vnd' : 'income_vnd';

      // Determine account (vault)
      const defaultAccount = ct.type === 'EXPENSE'
        ? config.DEFAULT_SPENDING_VAULT || 'TechcomBank_Spending'
        : config.DEFAULT_INCOME_VAULT || 'TechcomBank_Income';

      const actionJson = {
        action,
        params: {
          account: defaultAccount,
          vnd_amount: ct.amount_vnd,
          date: ct.date,
          counterparty: ct.counterparty,
          tag: ct.category,
          note: ct.note
        }
      };

      const result = await createPendingAction(config, {
        source: 'bank_statement_excel',
        raw_input: JSON.stringify(original),
        toon_text: JSON.stringify(ct),
        action_json: actionJson as any,
        confidence: ct.confidence,
        batch_id: batchId,
        meta: {
          bank: bankConfig.bank,
          transaction_ref: ct.source_ref,
          transaction_type: ct.type
        }
      }, correlationId);

      pendingActionIds.push(result.id);
      logger.debug({ id: result.id, type: ct.type }, 'Created pending action');

    } catch (error: any) {
      logger.error({ error: error.message, index: i }, 'Failed to create pending action');
      errors.push({ index: i, error: error.message });
    }
  }

  const result: BatchProcessResult = {
    batchId,
    totalTransactions: transactions.length,
    processedCount: pendingActionIds.length,
    failedCount: errors.length,
    pendingActionIds,
    errors
  };

  logger.info(result, 'Batch processing completed');
  return result;
}
```

### Task 3.2: Create CLI Tool

**File:** `ai-service/src/cli/processBankStatement.ts`

```typescript
#!/usr/bin/env node
import { processBankStatementFile } from '../api/batchProcessor';
import { TECHCOMBANK_CONFIG } from '../config/bankConfigs';
import path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const filePath = args[0] || path.join(__dirname, '../../data/SaoKeTK_29112025_28122025.xlsx');

  console.log(`Processing bank statement: ${filePath}`);

  const result = await processBankStatementFile(
    filePath,
    TECHCOMBANK_CONFIG,
    'cli-process'
  );

  console.log('\n=== Processing Complete ===');
  console.log(`Batch ID: ${result.batchId}`);
  console.log(`Total Transactions: ${result.totalTransactions}`);
  console.log(`Successfully Processed: ${result.processedCount}`);
  console.log(`Failed: ${result.failedCount}`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(e => {
      console.log(`  - Transaction ${e.index}: ${e.error}`);
    });
  }

  console.log(`\nView pending actions: GET /admin/pending-actions?batch_id=${result.batchId}`);
}

main().catch(console.error);
```

**Add to package.json:**
```json
{
  "scripts": {
    "process-bank-statement": "ts-node src/cli/processBankStatement.ts"
  }
}
```

## Phase 4: Backend API Extensions (2-3 days)

### Task 4.1: Update Pending Action Handler

**File:** `backend/src/handlers/pending-action.handler.ts` (enhance existing)

```typescript
// Add batch query endpoint
router.get('/admin/pending-actions/batches', (req, res) => {
  const batches = pendingActionRepository.getAllBatches();
  res.json(batches);
});

router.get('/admin/pending-actions/batch/:batchId', (req, res) => {
  const { batchId } = req.params;
  const actions = pendingActionRepository.findByBatchId(batchId);
  res.json(actions);
});

// Bulk approve
router.post('/admin/pending-actions/batch/:batchId/approve-all', async (req, res) => {
  const { batchId } = req.params;
  const actions = pendingActionRepository.findByBatchId(batchId);

  const results = [];
  for (const action of actions) {
    if (action.status === 'pending') {
      try {
        await executePendingAction(action);
        pendingActionRepository.updateStatus(action.id, 'approved');
        results.push({ id: action.id, status: 'approved' });
      } catch (error: any) {
        results.push({ id: action.id, status: 'failed', error: error.message });
      }
    }
  }

  res.json({ batchId, results });
});

// Execute action helper
async function executePendingAction(action: PendingAction) {
  const { action_json } = action;

  if (action_json.action === 'spend_vnd') {
    // Create expense transaction
    await transactionService.createExpense({
      asset: { type: 'FIAT', symbol: 'VND' },
      amount: action_json.params.vnd_amount,
      createdAt: action_json.params.date,
      account: action_json.params.account,
      counterparty: action_json.params.counterparty,
      category: action_json.params.tag,
      note: action_json.params.note
    });
  } else if (action_json.action === 'income_vnd') {
    // Create income transaction
    await vaultService.recordIncomeTx({
      asset: { type: 'FIAT', symbol: 'VND' },
      amount: action_json.params.vnd_amount,
      at: action_json.params.date,
      account: action_json.params.account,
      note: action_json.params.note
    });
  }
}
```

### Task 4.2: Add Repository Methods

**File:** `backend/src/repositories/pending-action.repository.ts`

```typescript
export class PendingActionRepository {
  // ... existing methods

  findByBatchId(batchId: string): PendingAction[] {
    return readStore().pendingActions.filter(pa => pa.batch_id === batchId);
  }

  getAllBatches(): Array<{ batchId: string; count: number; source: string }> {
    const store = readStore();
    const batchMap = new Map<string, { count: number; source: string }>();

    store.pendingActions.forEach(pa => {
      if (pa.batch_id) {
        const existing = batchMap.get(pa.batch_id);
        if (existing) {
          existing.count++;
        } else {
          batchMap.set(pa.batch_id, { count: 1, source: pa.source });
        }
      }
    });

    return Array.from(batchMap.entries()).map(([batchId, data]) => ({
      batchId,
      ...data
    }));
  }

  updateStatus(id: string, status: 'pending' | 'approved' | 'rejected'): boolean {
    const store = readStore();
    const action = store.pendingActions.find(pa => pa.id === id);
    if (!action) return false;

    action.status = status;
    action.reviewed_at = new Date().toISOString();
    writeStore(store);
    return true;
  }
}
```

## Phase 5: Frontend UI (3-4 days)

### Task 5.1: Create Upload Page

**File:** `frontend/src/pages/BankStatementUpload.tsx`

```typescript
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function BankStatementUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!file) return;

    setProcessing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/ai/process-bank-statement', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      setResult(data);

      // Navigate to batch review
      setTimeout(() => {
        navigate(`/pending-actions/batch/${data.batchId}`);
      }, 2000);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Upload Bank Statement</h1>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-4"
        />

        <button
          onClick={handleUpload}
          disabled={!file || processing}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {processing ? 'Processing...' : 'Upload & Process'}
        </button>
      </div>

      {result && (
        <div className="mt-6 p-4 bg-green-100 rounded">
          <h2 className="font-bold">Processing Complete!</h2>
          <p>Batch ID: {result.batchId}</p>
          <p>Processed: {result.processedCount} / {result.totalTransactions}</p>
          <p className="text-sm mt-2">Redirecting to review...</p>
        </div>
      )}
    </div>
  );
}
```

### Task 5.2: Create Batch Review Page

**File:** `frontend/src/pages/BatchReview.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function BatchReview() {
  const { batchId } = useParams();
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBatchActions();
  }, [batchId]);

  const loadBatchActions = async () => {
    const response = await fetch(`/admin/pending-actions/batch/${batchId}`);
    const data = await response.json();
    setActions(data);
    setLoading(false);
  };

  const approveAll = async () => {
    await fetch(`/admin/pending-actions/batch/${batchId}/approve-all`, {
      method: 'POST'
    });
    loadBatchActions();
  };

  const approveOne = async (id: string) => {
    await fetch(`/admin/pending-actions/${id}/approve`, { method: 'POST' });
    loadBatchActions();
  };

  const rejectOne = async (id: string) => {
    await fetch(`/admin/pending-actions/${id}/reject`, { method: 'POST' });
    loadBatchActions();
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Batch Review: {batchId}</h1>
        <button
          onClick={approveAll}
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          Approve All ({actions.filter(a => a.status === 'pending').length})
        </button>
      </div>

      <div className="space-y-4">
        {actions.map(action => (
          <div key={action.id} className="border rounded-lg p-4 bg-white shadow">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-bold text-sm text-gray-600">Original Transaction</h3>
                <pre className="text-xs mt-2 bg-gray-50 p-2 rounded">
                  {JSON.stringify(JSON.parse(action.raw_input), null, 2)}
                </pre>
              </div>

              <div>
                <h3 className="font-bold text-sm text-gray-600">AI Classification</h3>
                <pre className="text-xs mt-2 bg-blue-50 p-2 rounded">
                  {JSON.stringify(action.action_json, null, 2)}
                </pre>
                <div className="mt-2 text-sm">
                  <span className={`px-2 py-1 rounded ${
                    action.confidence > 0.8 ? 'bg-green-200' :
                    action.confidence > 0.6 ? 'bg-yellow-200' : 'bg-red-200'
                  }`}>
                    Confidence: {(action.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              {action.status === 'pending' && (
                <>
                  <button
                    onClick={() => approveOne(action.id)}
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => rejectOne(action.id)}
                    className="bg-red-500 text-white px-3 py-1 rounded text-sm"
                  >
                    Reject
                  </button>
                </>
              )}
              {action.status !== 'pending' && (
                <span className={`px-3 py-1 rounded text-sm ${
                  action.status === 'approved' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {action.status.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Testing the Pipeline

### Manual Test

1. **Start services:**
   ```bash
   # Terminal 1: Backend
   cd backend
   npm run dev

   # Terminal 2: AI Service
   cd ai-service
   npm run dev

   # Terminal 3: Frontend
   cd frontend
   npm run dev
   ```

2. **Process bank statement:**
   ```bash
   cd ai-service
   npm run process-bank-statement
   ```

3. **Review results:**
   - Open browser: `http://localhost:3000/pending-actions`
   - Find the batch by batch_id
   - Review each transaction
   - Approve or reject

4. **Verify vault updates:**
   ```bash
   curl http://localhost:8080/vaults?enrich=true
   ```

## Deployment Checklist

- [ ] Excel parser tested with multiple statement files
- [ ] AI classification accuracy > 80%
- [ ] Batch processing handles errors gracefully
- [ ] Frontend UI responsive and user-friendly
- [ ] API endpoints secured with authentication
- [ ] Duplicate detection implemented
- [ ] Logging and monitoring configured
- [ ] Documentation updated

## Next Steps

1. Add more bank configurations (VietinBank, MB Bank, etc.)
2. Implement auto-approval for high-confidence transactions
3. Add learning from user corrections
4. Build reconciliation feature
5. Add CSV support
6. Implement bank API direct integration
