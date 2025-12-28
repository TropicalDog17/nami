# Bank Statement Pipeline - Quick Reference

## 📊 Excel File Analysis

**File:** `ai-service/data/SaoKeTK_29112025_28122025.xlsx`

- **Bank:** Techcombank
- **Currency:** VND
- **Transactions:** 55 records
- **Date Range:** 29/11/2025 - 28/12/2025

### Sample Data Structure

```
Row 34: Header Row
Row 35+: Transaction Data

Columns:
  1  → Date (DD/MM/YYYY)
  7  → Remitter (Counterparty)
  16 → Bank
  24 → Details
  32 → Transaction Number
  45 → Debit (Expenses/Outgoing)
  53 → Credit (Income/Incoming)
  59 → Balance
```

### Example Transaction

```json
{
  "date": "29/11/2025",
  "remitter": "PVOIL HA NOI CHXD NGHIA TAN",
  "remitter_bank": "PVCOMBANK",
  "details": "TRAN ANH TUAN chuyen tien",
  "transaction_no": "FT25333054369120",
  "debit": "52,000",      // ← Expense
  "credit": "",            // ← Income
  "balance": "2,978,361"
}
```

## 🔄 Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. EXCEL FILE                                                    │
│    SaoKeTK_29112025_28122025.xlsx                               │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. PARSE EXCEL                                                   │
│    • Read rows 35+                                              │
│    • Extract 8 columns of data                                  │
│    • Skip header/footer rows                                    │
│    Output: BankTransaction[]                                    │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. AI CLASSIFICATION                                             │
│    For each transaction:                                        │
│    • Detect type: INCOME (credit) or EXPENSE (debit)           │
│    • Parse VND amount: "52,000" → 52000                        │
│    • Convert date: "29/11/2025" → "2025-11-29"                 │
│    • Extract counterparty from remitter                        │
│    • Categorize transaction (fuel, food, salary, etc.)        │
│    • Add confidence score (0.0 - 1.0)                          │
│    Output: ClassifiedTransaction[]                             │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. CREATE PENDING ACTIONS                                        │
│    For each classified transaction:                            │
│    • Build action object (spend_vnd or income_vnd)             │
│    • Assign to vault (spending or income)                      │
│    • Create pending action via backend API                     │
│    • Group by batch_id                                         │
│    Output: PendingAction[] with batch_id                       │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. MANUAL REVIEW (YOU)                                          │
│    Frontend UI shows:                                           │
│    • Batch of all transactions from the file                   │
│    • Side-by-side: Original vs AI Classification              │
│    • Confidence scores                                         │
│    Actions:                                                     │
│    ✓ Approve individual transactions                           │
│    ✓ Reject incorrect classifications                          │
│    ✓ Edit details before approving                             │
│    ✓ Bulk approve all high-confidence items                    │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├─── APPROVED ────▶ Execute Transaction
             │                   • Create Transaction record
             │                   • Update Vault (DEPOSIT/WITHDRAW)
             │                   • Calculate USD value
             │                   • Update balances
             │
             └─── REJECTED ────▶ Mark as rejected
                                 • No transaction created
                                 • Kept for audit trail
```

## 💡 Key Concepts

### Transaction Types

| Type | Excel Column | Vault Action | Description |
|------|--------------|--------------|-------------|
| **EXPENSE** | Debit (col 45) | WITHDRAW | Money going out (purchases, fees) |
| **INCOME** | Credit (col 53) | DEPOSIT | Money coming in (salary, refunds) |

### Vault Routing

```
EXPENSE transactions → SPENDING_VAULT → TechcomBank_Spending
INCOME transactions  → INCOME_VAULT   → TechcomBank_Income
```

### AI Classification

The AI analyzes transaction details to extract:

1. **Counterparty** - Clean merchant/person name
   - `"PVOIL HA NOI CHXD NGHIA TAN"` → `"PVOIL HA NOI"`

2. **Category** - Transaction type from available tags
   - Fuel, Groceries, Salary, Transfer, etc.

3. **Note** - Brief English summary
   - Vietnamese description → English explanation

4. **Confidence** - How certain the AI is (0.0 - 1.0)
   - High (>0.8): Auto-approve candidate
   - Medium (0.6-0.8): Review recommended
   - Low (<0.6): Requires careful review

## 🛠️ Implementation Components

### AI Service (New Files)

```
ai-service/
├── src/
│   ├── core/
│   │   ├── excelParser.ts              ← Parse Excel files
│   │   └── bankStatementClassifier.ts  ← AI classification
│   ├── config/
│   │   └── bankConfigs.ts              ← Bank-specific configs
│   ├── api/
│   │   └── batchProcessor.ts           ← Batch processing
│   └── cli/
│       └── processBankStatement.ts     ← CLI tool
└── data/
    └── SaoKeTK_29112025_28122025.xlsx
```

### Backend (Extensions)

```
backend/src/
├── handlers/
│   └── pending-action.handler.ts       ← Add batch endpoints
└── repositories/
    └── pending-action.repository.ts    ← Add batch queries
```

### Frontend (New Pages)

```
frontend/src/pages/
├── BankStatementUpload.tsx   ← Upload Excel file
└── BatchReview.tsx           ← Review & approve transactions
```

## 📝 Data Transformation Example

### Input (Excel Row)

```
Date: 29/11/2025
Remitter: PVOIL HA NOI CHXD NGHIA TAN
Bank: PVCOMBANK
Details: TRAN ANH TUAN chuyen tien
Transaction No: FT25333054369120
Debit: 52,000
Credit: (empty)
Balance: 2,978,361
```

### After Parsing

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

### After AI Classification

```json
{
  "date": "2025-11-29",
  "type": "EXPENSE",
  "amount_vnd": 52000,
  "counterparty": "PVOIL HA NOI",
  "category": "fuel",
  "note": "Fuel purchase at PVOIL gas station",
  "source_ref": "FT25333054369120",
  "confidence": 0.92
}
```

### Pending Action

```json
{
  "id": "pa_abc123",
  "source": "bank_statement_excel",
  "action_json": {
    "action": "spend_vnd",
    "params": {
      "account": "TechcomBank_Spending",
      "vnd_amount": 52000,
      "date": "2025-11-29",
      "counterparty": "PVOIL HA NOI",
      "tag": "fuel",
      "note": "Fuel purchase at PVOIL gas station"
    }
  },
  "confidence": 0.92,
  "batch_id": "bank_techcombank_1703808000000",
  "status": "pending",
  "meta": {
    "bank": "techcombank",
    "transaction_ref": "FT25333054369120"
  }
}
```

### After Approval → Final Transaction

```json
{
  "id": "tx_xyz789",
  "type": "EXPENSE",
  "asset": { "type": "FIAT", "symbol": "VND" },
  "amount": 52000,
  "createdAt": "2025-11-29T00:00:00Z",
  "account": "TechcomBank_Spending",
  "counterparty": "PVOIL HA NOI",
  "category": "fuel",
  "note": "Fuel purchase at PVOIL gas station",
  "rate": { "rateUSD": 0.000040, "source": "ER_API" },
  "usdAmount": 2.08
}
```

### Vault Entry Created

```json
{
  "vault": "TechcomBank_Spending",
  "type": "WITHDRAW",
  "asset": { "type": "FIAT", "symbol": "VND" },
  "amount": 52000,
  "at": "2025-11-29T00:00:00Z",
  "usdValue": 2.08
}
```

## 🚀 Quick Start Commands

### 1. Install Dependencies

```bash
cd ai-service
npm install xlsx  # or use Python's openpyxl
```

### 2. Process Bank Statement

```bash
cd ai-service
npm run process-bank-statement data/SaoKeTK_29112025_28122025.xlsx
```

### 3. Review in Frontend

```bash
# Open browser
http://localhost:3000/pending-actions/batch/bank_techcombank_xxx

# Or via API
curl http://localhost:8080/admin/pending-actions?batch_id=bank_techcombank_xxx
```

### 4. Approve Transactions

```bash
# Approve all in batch
curl -X POST http://localhost:8080/admin/pending-actions/batch/xxx/approve-all

# Approve single
curl -X POST http://localhost:8080/admin/pending-actions/pa_abc123/approve

# Reject single
curl -X POST http://localhost:8080/admin/pending-actions/pa_abc123/reject
```

## 📋 Approval Workflow

### Option 1: Individual Review

```
For each transaction:
1. View original bank data
2. Review AI classification
3. Check confidence score
4. Edit if needed
5. Click "Approve" or "Reject"
```

### Option 2: Bulk Operations

```
1. Review entire batch visually
2. Filter high-confidence (>0.8)
3. Click "Approve All High Confidence"
4. Manually review remaining items
```

### Option 3: Auto-Approve (Future)

```
Set threshold: confidence > 0.9
System auto-approves matching transactions
You review only flagged items
```

## 📊 Expected Output

After processing the sample file (55 transactions):

```
Batch ID: bank_techcombank_1703808000000
Total: 55 transactions

Breakdown:
  • EXPENSE (Debit): ~40 transactions
  • INCOME (Credit): ~15 transactions

High Confidence (>0.8): ~35 transactions
Medium Confidence (0.6-0.8): ~15 transactions
Low Confidence (<0.6): ~5 transactions

Vaults Updated:
  • TechcomBank_Spending: -2,500,000 VND
  • TechcomBank_Income: +500,000 VND
```

## 🎯 Benefits

1. **Batch Processing** - Process all 55 transactions at once
2. **AI Assistance** - Automatic categorization and classification
3. **Manual Control** - You approve/reject each transaction
4. **Audit Trail** - Full history of original data + classifications
5. **No Double Entry** - Direct import from bank statement
6. **Vault Integration** - Automatic balance updates
7. **Multi-Currency** - VND amounts + USD conversion

## 📚 Documentation

For detailed implementation:
- [bank-statement-pipeline.md](docs/bank-statement-pipeline.md) - Full architecture
- [bank-statement-implementation-guide.md](docs/bank-statement-implementation-guide.md) - Step-by-step code
