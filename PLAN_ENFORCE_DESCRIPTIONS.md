# Plan: Enforce Transaction Descriptions

## Problem Statement
Currently, transactions created through the AI service often have no description (showing "No description" in the UI), making it difficult to understand individual expenses in the spending breakdown. The `note`, `counterparty`, and `tag` fields are all optional, allowing transactions to be created without meaningful descriptions.

## Root Cause Analysis
Looking at the current implementation:

1. **Backend AI Endpoints** ([backend/src/handlers/ai.handler.ts](backend/src/handlers/ai.handler.ts)):
   - `/api/ai/expense-vnd` - All descriptive fields are optional: `counterparty`, `tag`, `note`
   - `/api/ai/income-vnd` - Same optional fields
   - `/api/ai/credit-expense-vnd` - Same optional fields
   - `/api/ai/card-payment-vnd` - Only has optional `note` field

2. **Transaction Service** ([backend/src/services/transaction.service.ts:126-183](backend/src/services/transaction.service.ts)):
   - `createExpenseTransaction` method accepts optional `note`, `category`, and `counterparty`
   - No validation to ensure at least one descriptive field is provided

3. **Display Logic** ([backend/src/handlers/reports.handler.ts:1510](backend/src/handlers/reports.handler.ts)):
   - Currently falls back to: `t.note || t.counterparty || "No description"`
   - This means if both are empty, we get generic text

## Proposed Solution

### Strategy: Multi-Layered Enforcement

We'll enforce meaningful descriptions at multiple layers to ensure data quality:

#### Layer 1: AI Service Validation (Immediate Fix)
**Goal:** Ensure AI service always provides meaningful transaction information

**Changes to [backend/src/handlers/ai.handler.ts](backend/src/handlers/ai.handler.ts):**

```typescript
// Add validation function
function validateTransactionDescription(params: {
  counterparty?: string;
  note?: string;
  tag?: string;
}): { valid: boolean; error?: string } {
  const hasCounterparty = params.counterparty && params.counterparty.trim().length > 0;
  const hasNote = params.note && params.note.trim().length > 0;
  const hasTag = params.tag && params.tag.trim().length > 0;

  if (!hasCounterparty && !hasNote) {
    return {
      valid: false,
      error: "Either 'counterparty' or 'note' is required to describe the transaction"
    };
  }

  return { valid: true };
}

// Update each AI endpoint to validate:
aiRouter.post("/ai/expense-vnd", requireSignature, async (req, res) => {
  const { vnd_amount, date, counterparty, tag, note, source_ref } = req.body || {};

  // Existing validations...

  // NEW: Validate description
  const descValidation = validateTransactionDescription({ counterparty, note, tag });
  if (!descValidation.valid) {
    return res.status(400).json({ error: descValidation.error });
  }

  // Continue with transaction creation...
});
```

**Rationale:**
- Forces AI to provide either counterparty (e.g., "Starbucks", "Amazon") OR note (e.g., "Coffee", "Office supplies")
- Tag alone is not enough - it's too generic (e.g., "food" doesn't tell us what/where)
- This is the most effective place to enforce since AI is the primary data entry point

#### Layer 2: Transaction Service Validation (Fallback)
**Goal:** Ensure all transaction creation paths validate descriptions

**Changes to [backend/src/services/transaction.service.ts](backend/src/services/transaction.service.ts):**

```typescript
class TransactionService {
  // Add validation method
  private validateDescription(params: {
    note?: string;
    counterparty?: string;
    category?: string;
  }): void {
    const hasDescription =
      (params.note && params.note.trim().length > 0) ||
      (params.counterparty && params.counterparty.trim().length > 0);

    if (!hasDescription) {
      throw new Error(
        "Transaction must have either 'note' or 'counterparty' to describe it. " +
        "Category/tag alone is not sufficient."
      );
    }
  }

  async createExpenseTransaction(params: {
    asset: Asset;
    amount: number;
    at?: string;
    account?: string;
    note?: string;
    category?: string;
    tags?: string[];
    counterparty?: string;
    dueDate?: string;
    sourceRef?: string;
  }): Promise<Transaction> {
    // NEW: Validate description before creating transaction
    this.validateDescription({
      note: params.note,
      counterparty: params.counterparty,
      category: params.category,
    });

    // Existing transaction creation logic...
  }

  // Apply same validation to:
  // - createIncomeTransaction
  // - Any other transaction creation methods
}
```

**Rationale:**
- Catches any transaction creation that bypasses AI endpoints
- Provides clear error messages for API consumers
- Ensures data quality at the business logic layer

#### Layer 3: Frontend Form Validation (Future Enhancement)
**Goal:** Guide users to provide descriptions when entering transactions manually

**Changes needed:**
1. Create/update transaction form components to make `note` or `counterparty` required
2. Add helpful placeholder text: "e.g., 'Grocery shopping' or 'Weekly groceries at Walmart'"
3. Show validation error if both fields are empty

**Note:** This is lower priority since AI service is the primary data entry method.

#### Layer 4: Migration Script for Existing Data
**Goal:** Improve descriptions for existing transactions with missing data

**Create [backend/src/scripts/enrichTransactionDescriptions.ts](backend/src/scripts/enrichTransactionDescriptions.ts):**

```typescript
/**
 * Script to enrich existing transactions with missing descriptions
 *
 * Strategy:
 * 1. Find transactions with empty note AND empty counterparty
 * 2. For each transaction, try to infer description from:
 *    - Category/tag: "Shopping expense", "Food expense", etc.
 *    - Date + amount: "Transaction on 2025-01-15 ($50.00)"
 * 3. Update transaction with generated description
 * 4. Log all changes for review
 */
async function enrichTransactionDescriptions() {
  const transactions = transactionRepository.findAll();
  const updated: string[] = [];

  for (const tx of transactions) {
    const hasDescription = tx.note || tx.counterparty;
    if (!hasDescription) {
      // Generate description based on available data
      let generatedNote = '';

      if (tx.category) {
        generatedNote = `${tx.category} - ${tx.type.toLowerCase()}`;
      } else if (tx.tags && tx.tags.length > 0) {
        generatedNote = `${tx.tags[0]} - ${tx.type.toLowerCase()}`;
      } else {
        generatedNote = `${tx.type} transaction`;
      }

      // Add amount info for clarity
      const dateStr = new Date(tx.createdAt).toLocaleDateString();
      generatedNote += ` (${dateStr})`;

      // Update transaction
      tx.note = generatedNote;
      transactionRepository.update(tx);
      updated.push(tx.id);

      console.log(`Updated ${tx.id}: "${generatedNote}"`);
    }
  }

  console.log(`\nEnriched ${updated.length} transactions`);
}
```

**Usage:**
```bash
npm run script -- enrichTransactionDescriptions
```

**Rationale:**
- Fixes historical data so existing reports look better
- One-time operation to improve data quality
- Can be run safely before deploying validation changes

### Implementation Order

1. **Phase 1 (Immediate):** Layer 1 - AI Service Validation
   - Quickest impact since AI is the primary data source
   - Can be deployed immediately
   - Estimated time: 30 minutes

2. **Phase 2 (Same Deploy):** Layer 2 - Transaction Service Validation
   - Complements Layer 1
   - Ensures all paths are covered
   - Estimated time: 30 minutes

3. **Phase 3 (Before Deploy):** Layer 4 - Migration Script
   - Run once to clean up existing data
   - Makes the UI look better immediately
   - Estimated time: 45 minutes (includes testing)

4. **Phase 4 (Future):** Layer 3 - Frontend Validation
   - Lower priority since manual entry is less common
   - Can be done as part of future UI improvements
   - Estimated time: 1-2 hours

### Testing Plan

#### Unit Tests
```typescript
// Test AI endpoint validation
describe('AI Endpoint Validation', () => {
  it('should reject expense without note or counterparty', async () => {
    const response = await request(app)
      .post('/api/ai/expense-vnd')
      .send({
        vnd_amount: 100000,
        date: '2025-01-26',
        tag: 'food' // Only tag, no description
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('counterparty');
  });

  it('should accept expense with note', async () => {
    const response = await request(app)
      .post('/api/ai/expense-vnd')
      .send({
        vnd_amount: 100000,
        date: '2025-01-26',
        note: 'Coffee at Starbucks'
      });

    expect(response.status).toBe(201);
  });

  it('should accept expense with counterparty', async () => {
    const response = await request(app)
      .post('/api/ai/expense-vnd')
      .send({
        vnd_amount: 100000,
        date: '2025-01-26',
        counterparty: 'Starbucks',
        tag: 'food'
      });

    expect(response.status).toBe(201);
  });
});

// Test transaction service validation
describe('TransactionService', () => {
  it('should throw error when creating expense without description', async () => {
    await expect(
      transactionService.createExpenseTransaction({
        asset: { type: 'FIAT', symbol: 'VND' },
        amount: 100000,
        category: 'food' // Only category, no note/counterparty
      })
    ).rejects.toThrow('must have either');
  });
});
```

#### Integration Tests
1. Test all AI endpoints with various combinations of fields
2. Test transaction creation through different paths
3. Verify error messages are clear and actionable

#### Manual Testing
1. Call AI endpoints with missing descriptions - should fail with clear error
2. Create transactions via UI (if applicable) - should show validation
3. Check existing transactions after running migration script
4. Verify spending page shows meaningful descriptions

### API Contract Updates

Update [API_CONTRACT.md](API_CONTRACT.md) to reflect new requirements:

```markdown
### POST /api/ai/expense-vnd
Record an expense in VND.

**Request Body:**
```json
{
  "vnd_amount": 100000.0,          // Required: positive number
  "date": "2025-01-05",            // Required: YYYY-MM-DD format
  "note": "Weekly shopping",       // Required if counterparty is missing
  "counterparty": "Store",         // Required if note is missing
  "tag": "groceries",              // Optional
  "source_ref": "txn123"           // Optional
}
```

**Validation Rules:**
- Either `note` OR `counterparty` must be provided (at least one non-empty)
- `tag` alone is not sufficient - it must be accompanied by `note` or `counterparty`

**Error Response:** `400 Bad Request`
```json
{
  "error": "Either 'counterparty' or 'note' is required to describe the transaction"
}
```
```

### Rollout Plan

1. **Pre-deployment:**
   - Run migration script to enrich existing transactions
   - Review and test on staging environment
   - Update API documentation

2. **Deployment:**
   - Deploy backend changes (Layers 1 & 2)
   - Monitor error logs for any issues
   - Verify AI service adapts to new requirements

3. **Post-deployment:**
   - Check spending page - all transactions should have descriptions
   - Monitor API error rates
   - Gather feedback from AI service team (if applicable)

4. **Future iteration:**
   - Add frontend validation (Layer 3)
   - Consider AI-powered description enhancement
   - Add bulk edit capability for descriptions in admin panel

### Success Metrics

- **Before:** X% of transactions have "No description"
- **After:** 0% of new transactions have "No description"
- **Goal:** All transactions have meaningful, actionable descriptions
- **Monitoring:** Track percentage of transactions with empty note AND empty counterparty

### Risk Assessment

**Low Risk:**
- Changes are additive validation only
- No data structure changes
- Migration script is read-only for existing data quality

**Potential Issues:**
1. **AI service integration breaks:** If external AI service doesn't handle validation errors
   - **Mitigation:** Clear error messages, update AI service documentation

2. **Existing integrations fail:** Other services calling AI endpoints
   - **Mitigation:** Phase 1 can be feature-flagged if needed

3. **Migration script performance:** Large transaction datasets
   - **Mitigation:** Run in batches, add progress logging

### Alternative Approaches Considered

1. **AI-powered description generation:**
   - Use AI to generate descriptions from category + amount + date
   - **Rejected:** Adds complexity and cost; better to enforce at source

2. **Make note field required only:**
   - Simpler validation
   - **Rejected:** Counterparty is often clearer (merchant name vs. note)

3. **Allow tag alone as description:**
   - More permissive
   - **Rejected:** Tags are too generic (e.g., "food" doesn't help identify specific expense)

## Conclusion

This multi-layered approach ensures:
- ✅ New transactions always have meaningful descriptions
- ✅ Existing data is enriched
- ✅ Multiple validation points prevent gaps
- ✅ Clear error messages guide API consumers
- ✅ Minimal risk to existing functionality

The spending page will immediately become more useful with specific transaction details visible on hover and in the modal.
