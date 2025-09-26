# Feature Specification: Transaction Tracking Schema

**Feature Branch**: `001-title-transaction-tracking`
**Created**: 2025-09-26
**Status**: Draft
**Input**: User description: "Specification for logging and processing financial transactions supporting dual-currency valuation (USD+VND), credit card flows, and ROI/cashflow reporting. Includes types, amounts, FX fields, fees, derived metrics, optional tracking, and reporting layers."

## Clarifications

### Session 2025-09-26

- Q: Can admin modify the `Type` enum via Admin UI? → A: Admin can directly add/edit/delete Type values via Admin UI (dynamic enum).

## Execution Flow (main)

```
1. Parse user description from Input
   → If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   → Identify: actors, actions, data, constraints
3. For each unclear aspect:
   → Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   → If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate Functional Requirements
   → Each requirement must be testable
   → Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   → If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   → If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines

- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

### Section Requirements

- **Mandatory sections**: Must be completed for every feature
- **Optional sections**: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")

### For AI Generation

When creating this spec from a user prompt:

1. **Mark all ambiguities**: Use [NEEDS CLARIFICATION: specific question] for any assumption you'd need to make
2. **Don't guess**: If the prompt doesn't specify something (e.g., "login system" without auth method), mark it
3. **Think like a tester**: Every vague requirement should fail the "testable and unambiguous" checklist item
4. **Common underspecified areas**:
   - User types and permissions
   - Data retention/deletion policies
   - Performance targets and scale
   - Error handling behaviors
   - Integration requirements
   - Security/compliance needs

---

## User Scenarios & Testing _(mandatory)_

### Primary User Story

As a user of the finance app, I want every financial event (spend, investment, lending, borrowing, DeFi/LP activity, credit card swipe, repayment, fees, interest) recorded as a single atomic transaction row so I can reliably report holdings, cash flows, and ROI in both USD and VND.

### Acceptance Scenarios

1. **Given** a new buy transaction, **When** the user saves it with Asset=BTC, Quantity=0.5, PriceLocal specified, FX rates provided, **Then** the system records AmountLocal, AmountUSD, AmountVND, ΔQty=+0.5, and CashFlowUSD/VND = negative net of AmountUSD and FeeUSD.
2. **Given** a credit card swipe expense, **When** the transaction is recorded with Account=CreditCard and Fee=0, **Then** ΔQty is negative for the CreditCard liability, CashFlowUSD/VND = 0 until a separate `repay_borrow` event clears the liability and records the cash outflow.
3. **Given** LP deposit/withdraw events, **When** user records deposit of LP tokens and subsequent income events, **Then** holdings are updated by ΔQty and cashflows reflect deposits/withdrawals and earned fees as income types.

### Edge Cases

- How to represent multi-leg transactions (e.g., swap A→B with fee in B)? Represent as two atomic rows: a `transfer_out` for A and a `transfer_in` for B, plus an optional `fee` row if fee is captured separately.
- What if FX rates are missing? Use nearest-day mid-market rate as fallback, allow manual rate override, or mark transaction as draft until FX rate is available.
- How to record cashback/reward tied to a specific expense? Record a separate `reward` transaction with Counterparty referencing the original expense ID.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST record one atomic transaction per event with the schema fields defined below.
- **FR-002**: System MUST support a managed `Type` set. The initial canonical list is: {buy, sell, deposit, withdraw, transfer_in, transfer_out, expense, income, reward, airdrop, fee, lend, repay, interest, borrow, repay_borrow, interest_expense}. Admin users MUST be able to add/edit/delete `Type` values via the Admin UI; all changes MUST be versioned, validated, and recorded with an audit trail.
- **FR-003**: System MUST validate that transactions reference an existing `Type` and surface warnings/errors for deprecated/renamed types.
- **FR-004**: System MUST store every transaction in three canonical value spaces: Asset native currency (`AmountLocal`), USD (`AmountUSD`), and VND (`AmountVND`).
- **FR-005**: System MUST persist `FX_to_USD` and `FX_to_VND` used for conversion with timestamps to allow reproducible valuation and FXImpact calculations.
- **FR-006**: System MUST calculate derived metrics (`ΔQty`, `CashFlowUSD`, `CashFlowVND`) at write-time and store them in the transaction record.
- **FR-007**: System MUST support fee capture as separate columns (`FeeUSD`, `FeeVND`) and allow `fee` to be a standalone `Type` or attached to other Types.
- **FR-008**: System MUST support credit card flows as two-step events: initial `expense` (Account=CreditCard, CashFlow=0) and later `repay_borrow` (Cash/Bank outflow, reduces CreditCard liability).
- **FR-009**: System MUST allow optional fields to support advanced reporting: `Horizon`, `EntryDate`, `ExitDate`, `FXImpact`.
- **FR-010**: System MUST provide queryable reporting layers for Holdings, Cash Flow, Spending, Lending, Borrowing, and LP/DeFi aggregated per the rules in this spec.

### Non-functional Requirements

- **NFR-001**: Stored FX rates and derived numeric fields MUST be precise enough for financial reporting (recommend decimal with at least 8 significant digits where applicable).
- **NFR-002**: Schema changes to `Type` MUST be controlled through admin UI and require migration planning for existing data.
- **NFR-003**: API responses SHOULD complete within reasonable time for personal use (target < 1 second for typical operations).
- **NFR-004**: System MUST validate all user inputs to prevent invalid data entry and basic security issues.
- **NFR-005**: Application SHOULD handle up to 10,000 transactions without significant performance degradation.

### Key Entities

- **Transaction**: One atomic row representing an event. Key attributes described in the Schema section below.
- **Account**: Location of assets (Cash, Bank, CreditCard, Exchange, Vault, Peer Loan). Tracks balances via SUM(ΔQty).
- **Asset**: Currency or token (symbol + optional metadata like decimals).
- **TransactionType**: Admin-configurable transaction category (buy, sell, expense, etc.) with audit trail for changes.

---

## Transaction Schema (canonical)

Fields below are REQUIRED unless marked OPTIONAL.

- `Date` (date) — Execution date of the transaction.
- `Type` (enum) — References TransactionType name: `buy, sell, deposit, withdraw, transfer_in, transfer_out, expense, income, reward, airdrop, fee, lend, repay, interest, borrow, repay_borrow, interest_expense`.
- `Asset` (string) — Currency or token symbol (e.g., `VND`, `USD`, `USDT`, `BTC`).
- `Account` (string) — Where the asset sits (`Cash`, `Bank`, `CreditCard`, `Binance Spot`, `Vault`, `Friend A Loan`).
- `Counterparty` (string) — External entity (merchant, friend, protocol, employer).
- `Tag` (string) — Category for reporting (e.g., `Food`, `Housing`, `LP`, `Staking`, `Salary`).
- `Note` (string) — Free text description.

### Transaction Amount Fields

- `Quantity` (decimal) — Number of units of the asset. For flat expenses, use `1`.
- `PriceLocal` (decimal) — Unit price in the asset’s native currency. For flat expenses, equal to total.
- `AmountLocal` (decimal) — `Quantity × PriceLocal` (denominated in `Asset` currency).

### Conversion & Dual-Currency Valuation

- `FX_to_USD` (decimal) — Conversion rate from `Asset` → USD at transaction date.
- `FX_to_VND` (decimal) — Conversion rate from `Asset` → VND at transaction date.
- `AmountUSD` (decimal) — `AmountLocal × FX_to_USD`.
- `AmountVND` (decimal) — `AmountLocal × FX_to_VND`.

### Fees

- `FeeUSD` (decimal) — Fee converted to USD.
- `FeeVND` (decimal) — Fee converted to VND.

### Derived Metrics (stored)

- `ΔQty` (decimal) — Change in asset balance. Examples: `buy` = `+Quantity`, `sell` = `-Quantity`, `deposit` = `+Quantity`, `withdraw` = `-Quantity`.
- `CashFlowUSD` (decimal) — Signed USD cashflow. Example: `buy` = `-(AmountUSD + FeeUSD)`, `sell` = `+(AmountUSD - FeeUSD)`.
- `CashFlowVND` (decimal) — Signed VND cashflow, same logic as USD.

### Special rules / cases

- `expense` with `Account=CreditCard` => `ΔQty` negative in `CreditCard` account, but `CashFlowUSD`/`CashFlowVND` = `0` at swipe; a later `repay_borrow` transaction records cash outflow and reduces `CreditCard` liability.
- `repay_borrow` => `ΔQty` negative in `Cash`/`Bank` account, positive in `CreditCard` (clears liability); ensure counterpart references exist.
- Multi-leg swaps: represent as `transfer_out` + `transfer_in` (and optional `fee` row).

### Optional Tracking Fields

- `Horizon` (enum) — `short-term` / `long-term` (for allocation/ROI reporting). OPTIONAL.
- `EntryDate` (date) — For APR/CAGR calculation of lending, vaults, or fixed-term positions. OPTIONAL.
- `ExitDate` (date) — OPTIONAL.
- `FXImpact` (decimal) — `(AmountUSD × Current_USD→VND) – AmountVND_at_entry` to isolate FX-driven P/L. OPTIONAL and requires storing `AmountVND_at_entry` or `EntryDate`.

---

## Reporting Layers

- **Holdings**: SUM(ΔQty) per `Asset` × latest price × FX_to_VND/current USD→VND for domestic reporting; or × latest price × FX_to_USD for global reporting.
- **Cash Flow**: SUM(`CashFlowUSD`/`CashFlowVND`) grouped by `Type` and time window.
- **Spending**: Filter `Type=expense` and group by `Tag`/`Counterparty`.
- **Lending**: Net `lend` − `repay` + `interest`.
- **Borrowing**: Net `borrow` − `repay_borrow` + `interest_expense`.
- **LP/DeFi**: Represented as `deposit`/`withdraw` of LP tokens plus `income` from fees; track `Quantity` of LP tokens and underlying asset exposures separately if available.

---

## Design Principles

- One row = one atomic event. Avoid bundling multiple logical actions into a single row.
- TransactionTypes are admin-configurable with audit trails. Push contextual information (merchant, protocol, LP pool) into `Tag` and `Counterparty`.
- Dual-currency valuation ensures analysis in both USD (global ROI) and VND (domestic purchasing power).
- Credit flows require two steps: `expense` (at swipe) + `repay_borrow` (at settlement) to keep liability and cash movement auditable.

---

## Operational Considerations

- Persist FX source and timestamp for auditability (e.g., `fx_source`, `fx_timestamp`). Use exchangerate-api.com or similar free API as primary source, with manual entry as backup.
- Data retention and correction policy: edits to historical transactions should keep an audit trail and preserve original FX rates and derived cached values for reproducibility.
- Migrations that change `Type` values or add required fields must include a plan to backfill `AmountUSD`/`AmountVND` and `ΔQty` where missing.

## Review & Acceptance Checklist

- [ ] One atomic row per event enforced in UI and importers
- [ ] All required schema fields present and validated
- [ ] Derived fields (`ΔQty`, `CashFlowUSD`, `CashFlowVND`) computed and stored
- [ ] FX rates persisted with source and timestamp
- [ ] Credit card two-step flow works end-to-end in test data
- [ ] Reporting layers produce expected aggregates for sample dataset

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked where relevant
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [ ] Review checklist passed

---

## UI Surfaces (web)

This feature will provide a full web UI per the user's choice (Option A):

- **Transaction Input Form** (primary user-facing):

  - Single-page form to create one atomic transaction.
  - Fields: `Date`, `Type` (enum selector), `Asset`, `Account`, `Counterparty`, `Tag`, `Note`, `Quantity`, `PriceLocal`, `AmountLocal` (auto-calculated), `FX_to_USD`, `FX_to_VND`, `AmountUSD`, `AmountVND`, `FeeUSD`, `FeeVND`, optional `Horizon`, `EntryDate`, `ExitDate`.
  - Validation rules: required fields (`Date`, `Type`, `Asset`, `Account`, `Quantity`/`PriceLocal` or `AmountLocal`), numeric precision, enum validation for `Type`.
  - UX: allow manual FX override and show derived calculations in real-time; support save-as-draft for missing FX.

- **Admin Pages** (manage system configuration):

  - Manage master data: `Type` (read-only list with controlled process to request changes), `Account` list, `Asset` list (with decimals metadata), `Tag` taxonomy, FX sources, and `Counterparty` registry.
  - Audit and edit historical transactions (with immutable audit trail preserved for original values and FX).
  - Import/Export CSV for bulk onboarding and corrections.

- **Reporting Dashboard** (insights & aggregates):
  - Holdings view (by Asset, by Account) with dual-currency toggles (USD/VND) and timeline.
  - Cash Flow reports (by Type, by Tag) with date-range filters and export.
  - Spending breakdowns, Lending/Borrowing nets, LP/DeFi summaries.
  - Drill-down from aggregates to individual transaction rows.
  - P&L (Profit & Loss), ROI (Return on Investment), CAGR (Compound Annual Growth Rate), and other financial performance metrics.

UI notes:

- Credit-card flow: UI should encourage recording `expense` at swipe and provide a quick action to create a matching `repay_borrow` when recording repayment.
- Multi-leg operations: provide an advanced mode to create linked rows (transfer_out + transfer_in + optional fee) and store link IDs between rows.
