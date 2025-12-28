# Bank Statement Processing Pipeline

## Overview

This document describes the end-to-end pipeline for processing Vietnamese bank statement Excel files (e.g., `SaoKeTK_29112025_28122025.xlsx`) through the AI service, parsing transactions, and routing them to spending/income vaults with manual approval.

## Excel File Structure

### Bank: Techcombank (NGÂN HÀNG TMCP KỸ THƯƠNG VIỆT NAM)
### Format: Vietnamese Bank Statement

**File Details:**
- Currency: VND
- Account Type: Current Account
- Date Range: 29/11/2025 - 28/12/2025
- Total Transactions: ~55 transactions

**Data Schema (Starting at Row 34):**

| Column | Field | Description |
|--------|-------|-------------|
| 1 | Date | Transaction date (DD/MM/YYYY format) |
| 7 | Remitter | Counterparty/merchant name |
| 16 | Remitter Bank | Bank of the counterparty |
| 24 | Details | Transaction description |
| 32 | Transaction No | Unique transaction reference |
| 45 | Debit | Outgoing amount (expense) |
| 53 | Credit | Incoming amount (income) |
| 59 | Balance | Account balance after transaction |

**Example Transactions:**

```json
{
  "date": "29/11/2025",
  "remitter": "PVOIL HA NOI CHXD NGHIA TAN",
  "remitter_bank": "NGAN HANG TMCP DAI CHUNG VIET NAM (PVCOMBANK)",
  "details": "TRAN ANH TUAN chuyen tien",
  "transaction_no": "FT25333054369120",
  "debit": "52,000",
  "credit": "",
  "balance": "2,978,361"
}
```

## Pipeline Architecture

### Phase 1: Excel Parsing & Extraction

**Component:** `ai-service/src/core/excelParser.ts` (to be created)

**Responsibilities:**
1. Read Excel file using `openpyxl` or Node.js `xlsx` library
2. Locate transaction table (starting at row 34)
3. Extract structured transaction data
4. Normalize data format

**Input:**
- Excel file path: `ai-service/data/SaoKeTK_29112025_28122025.xlsx`

**Output:**
```typescript
interface BankTransaction {
  date: string;           // "29/11/2025"
  remitter: string;       // Counterparty
  remitter_bank: string;  // Bank name
  details: string;        // Description
  transaction_no: string; // Reference ID
  debit: string;          // "52,000" or ""
  credit: string;         // "284" or ""
  balance: string;        // "2,978,361"
}
```

### Phase 2: Transaction Classification with AI

**Component:** `ai-service/src/core/bankStatementClassifier.ts` (to be created)

**Responsibilities:**
1. Use LLM (OpenAI/Anthropic) to analyze transaction details
2. Classify as INCOME or EXPENSE
3. Extract/infer category/tag from transaction description
4. Parse amount from Vietnamese number format (commas)
5. Convert date from DD/MM/YYYY to YYYY-MM-DD

**AI Prompt Structure:**
```
System: You are a financial transaction classifier for Vietnamese bank statements.

User: Analyze this transaction and output JSON:
{
  "date": "YYYY-MM-DD",
  "type": "INCOME" | "EXPENSE",
  "amount_vnd": number,
  "counterparty": "merchant/person name",
  "category": "suggested category",
  "note": "brief description"
}

Transaction:
Date: 29/11/2025
Remitter: PVOIL HA NOI CHXD NGHIA TAN
Bank: PVCOMBANK
Details: TRAN ANH TUAN chuyen tien
Debit: 52,000
Credit: (empty)
```

**Output:**
```typescript
interface ClassifiedTransaction {
  date: string;              // "2025-11-29"
  type: 'INCOME' | 'EXPENSE';
  amount_vnd: number;        // 52000
  counterparty: string;      // "PVOIL HA NOI"
  category?: string;         // "fuel", "groceries", etc.
  note: string;              // Original details
  source_ref: string;        // Transaction number
  confidence: number;        // 0.0 - 1.0
}
```

### Phase 3: Pending Action Creation

**Component:** Existing `ai-service/src/api/backendClient.ts`

**Responsibilities:**
1. Create pending action records for each classified transaction
2. Route to appropriate vault based on transaction type
3. Sign requests with HMAC for security

**Logic:**
```typescript
// For EXPENSE transactions (debit field populated)
if (transaction.type === 'EXPENSE') {
  action = {
    action: 'spend_vnd',
    params: {
      account: getDefaultSpendingVault(), // or classify to specific vault
      vnd_amount: transaction.amount_vnd,
      date: transaction.date,
      counterparty: transaction.counterparty,
      tag: transaction.category,
      note: transaction.note
    }
  }
}

// For INCOME transactions (credit field populated)
if (transaction.type === 'INCOME') {
  action = {
    action: 'income_vnd',  // New action type needed
    params: {
      account: getDefaultIncomeVault(),
      vnd_amount: transaction.amount_vnd,
      date: transaction.date,
      counterparty: transaction.counterparty,
      tag: transaction.category,
      note: transaction.note
    }
  }
}
```

**API Call:**
```typescript
await createPendingAction(config, {
  source: 'bank_statement_excel',
  raw_input: JSON.stringify(bankTransaction),
  toon_text: JSON.stringify(classifiedTransaction),
  action_json: action,
  confidence: classifiedTransaction.confidence,
  batch_id: `bank_${filename}_${timestamp}`,
  meta: {
    bank: 'techcombank',
    account_number: '19036671430013',
    transaction_ref: bankTransaction.transaction_no
  }
});
```

### Phase 4: Backend Storage

**Component:** `backend/src/handlers/pending-action.handler.ts` (existing)

**Responsibilities:**
1. Validate HMAC signature
2. Store pending action in database/JSON store
3. Return pending action ID

**Database Schema:**
```typescript
interface PendingAction {
  id: string;
  source: 'bank_statement_excel';
  raw_input: string;
  toon_text?: string;
  action_json?: ActionRequest;
  confidence?: number;
  batch_id?: string;
  meta?: {
    bank: string;
    account_number: string;
    transaction_ref: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at?: string;
}
```

### Phase 5: Manual Review & Approval

**Component:** Frontend UI (to be enhanced)

**User Interface:**
1. **Batch Review Screen**
   - Display all transactions from a bank statement file
   - Group by batch_id
   - Show original transaction details alongside AI classification
   - Bulk actions: Approve All, Reject All, Selective Review

2. **Individual Transaction Review**
   - Show original bank statement data
   - Show AI-classified data (editable)
   - Allow modification of:
     - Transaction type (INCOME/EXPENSE)
     - Amount
     - Vault/account assignment
     - Category/tag
     - Note
   - Actions: Approve, Reject, Edit & Approve

**API Endpoints (to be created):**
```typescript
// Get pending actions by batch
GET /admin/pending-actions?batch_id=bank_xxx
GET /admin/pending-actions?source=bank_statement_excel

// Review action
POST /admin/pending-actions/:id/approve
POST /admin/pending-actions/:id/reject
PATCH /admin/pending-actions/:id  // Edit before approval
```

### Phase 6: Transaction Execution

**Component:** `backend/src/handlers/pending-action.handler.ts` (to be enhanced)

**On Approval:**
1. Execute the action based on `action_json.action`
2. For `spend_vnd`: Create expense transaction + vault entry
3. For `income_vnd`: Create income transaction + vault entry
4. Update pending action status to 'approved'

**Transaction Creation:**
```typescript
// For EXPENSE
const transaction = await createTransaction({
  type: 'EXPENSE',
  asset: { type: 'FIAT', symbol: 'VND' },
  amount: action.params.vnd_amount,
  createdAt: action.params.date,
  account: action.params.account,
  counterparty: action.params.counterparty,
  category: action.params.tag,
  note: action.params.note,
  // ... rate and usdAmount
});

// Add vault entry (WITHDRAW from spending vault)
await vaultService.addVaultEntry({
  vault: action.params.account,
  type: 'WITHDRAW',
  asset: { type: 'FIAT', symbol: 'VND' },
  amount: action.params.vnd_amount,
  at: action.params.date,
  usdValue: computedUSD
});
```

```typescript
// For INCOME
const transaction = await createTransaction({
  type: 'INCOME',
  asset: { type: 'FIAT', symbol: 'VND' },
  amount: action.params.vnd_amount,
  createdAt: action.params.date,
  account: action.params.account,
  counterparty: action.params.counterparty,
  category: action.params.tag,
  note: action.params.note,
  // ... rate and usdAmount
});

// Add vault entry (DEPOSIT to income vault)
await vaultService.addVaultEntry({
  vault: action.params.account,
  type: 'DEPOSIT',
  asset: { type: 'FIAT', symbol: 'VND' },
  amount: action.params.vnd_amount,
  at: action.params.date,
  usdValue: computedUSD
});
```

## Implementation Plan

### Step 1: Excel Parser Module
**File:** `ai-service/src/core/excelParser.ts`

```typescript
export interface BankStatementConfig {
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
}

export async function parseExcelBankStatement(
  filePath: string,
  config: BankStatementConfig
): Promise<BankTransaction[]>;
```

### Step 2: AI Classifier Module
**File:** `ai-service/src/core/bankStatementClassifier.ts`

```typescript
export async function classifyBankTransaction(
  llmClient: LLMClient,
  transaction: BankTransaction,
  accounts: AccountRef[],
  tags: TagRef[],
  correlationId?: string
): Promise<ClassifiedTransaction>;

export async function classifyBatch(
  llmClient: LLMClient,
  transactions: BankTransaction[],
  accounts: AccountRef[],
  tags: TagRef[],
  batchSize: number = 10
): Promise<ClassifiedTransaction[]>;
```

### Step 3: Batch Processing API
**File:** `ai-service/src/api/batchProcessor.ts`

```typescript
export async function processBankStatementFile(
  filePath: string,
  config: AppConfig,
  correlationId?: string
): Promise<{
  batchId: string;
  totalTransactions: number;
  processedCount: number;
  failedCount: number;
  pendingActionIds: string[];
}>;
```

### Step 4: Backend Extensions

**New Action Types:**
- Add `income_vnd` to `ActionRequestSchema`
- Add `income_credit_vnd` for credit card income

**New Endpoints:**
```typescript
// Batch management
GET /admin/pending-actions/batches
GET /admin/pending-actions/batch/:batchId

// Bulk operations
POST /admin/pending-actions/batch/:batchId/approve-all
POST /admin/pending-actions/batch/:batchId/reject-all
```

### Step 5: Frontend UI

**New Pages:**
1. `frontend/src/pages/BankStatementUpload.tsx`
   - File upload component
   - Processing progress indicator
   - Navigate to batch review on completion

2. `frontend/src/pages/BatchReview.tsx`
   - Table view of all pending actions in batch
   - Inline editing capabilities
   - Bulk action buttons

3. `frontend/src/components/TransactionReviewCard.tsx`
   - Split view: original vs classified
   - Editable form fields
   - Approve/Reject buttons

## Data Flow Summary

```
┌─────────────────────┐
│  Excel File         │
│  (Bank Statement)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Excel Parser       │
│  Extract rows       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  AI Classifier      │
│  - Identify type    │
│  - Extract details  │
│  - Categorize       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Pending Actions    │
│  (Backend Storage)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Manual Review UI   │
│  - Batch view       │
│  - Edit & Approve   │
│  - Reject           │
└──────────┬──────────┘
           │
           ├──────── Approved ───────►┌─────────────────────┐
           │                          │  Execute Action     │
           │                          │  - Create Tx        │
           │                          │  - Update Vault     │
           │                          └─────────────────────┘
           │
           └──────── Rejected ───────►┌─────────────────────┐
                                      │  Mark as Rejected   │
                                      │  (No Transaction)   │
                                      └─────────────────────┘
```

## Configuration

### AI Service Config
```env
# Bank statement processing
BANK_STATEMENT_PARSER=openpyxl
MAX_BATCH_SIZE=50
CLASSIFICATION_CONFIDENCE_THRESHOLD=0.7

# Default vaults
DEFAULT_SPENDING_VAULT=TechcomBank_Spending
DEFAULT_INCOME_VAULT=TechcomBank_Income
```

### Techcombank Statement Config
```json
{
  "bank": "techcombank",
  "headerRow": 33,
  "dataStartRow": 35,
  "skipPattern": "Số dư đầu kỳ|Phiếu này|Diễn giải",
  "columns": {
    "date": 1,
    "remitter": 7,
    "remitterBank": 16,
    "details": 24,
    "transactionNo": 32,
    "debit": 45,
    "credit": 53,
    "balance": 59
  },
  "dateFormat": "DD/MM/YYYY",
  "numberFormat": "vn_comma"
}
```

## Error Handling

### Validation Rules
1. **Date validation**: Must parse to valid date
2. **Amount validation**: Exactly one of debit/credit must be populated
3. **Duplicate detection**: Check transaction_no against existing transactions
4. **Balance reconciliation**: Verify running balance if needed

### Error States
- **Parse errors**: Invalid Excel format → User notification
- **Classification errors**: Low confidence → Flag for manual review
- **API errors**: Retry with exponential backoff
- **Duplicate transactions**: Skip with warning

## Testing Strategy

### Unit Tests
- Excel parser with various formats
- AI classifier with mock LLM responses
- Date/number format conversions

### Integration Tests
- End-to-end batch processing
- Approval workflow
- Vault entry creation

### Test Data
- Sample Excel files with various transaction types
- Edge cases: refunds, fees, transfers between own accounts

## Future Enhancements

1. **Auto-approval**: Transactions above confidence threshold
2. **Learning**: Remember user corrections for similar transactions
3. **Multi-bank support**: Different parsers for different banks
4. **Reconciliation**: Match against existing transactions
5. **Duplicate detection**: Prevent double-entry
6. **Bank API integration**: Direct connection instead of Excel upload
7. **CSV support**: Parse CSV exports from other banks
8. **OCR support**: Process scanned bank statements
