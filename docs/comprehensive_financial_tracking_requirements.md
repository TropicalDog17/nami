Comprehensive Financial Tracking Requirements
Overview

This document defines a comprehensive end-to-end scenario for an enhanced financial transaction management system. It shows how all features work together to track:

Expenses

Credit card spending

Investments (vault-based and standard)

Crypto and stocks

Other asset classes

The goal is to support accurate holdings, cash flow, and performance reporting across multiple accounts and asset types.

### Basic Usage Snapshot

| Flow | What the user does | Required data captured at entry | Reports impacted |
| --- | --- | --- | --- |
| Expense | Log daily costs (rent, groceries) and occasional refunds | Amount, category/tag, counterparty, stored FX snapshot | Spending trend, operating cash flow |
| Vault Investment | DCA deposits and occasional withdrawals inside a BTC vault | Quantity, vault ID, price at trade time, FX snapshot | Holdings, investment performance |
| Income | Salary in USD plus freelance gig in VND settled later | Gross/net split, employer, FX at earning timestamp | Cash flow (operating inflow), spending offsets |
| Savings | Monthly interest on savings/CD plus potential penalties | Interest amount, account, rate source | Cash flow (interest inflow), holdings |
| Transfer | Move funds Bank→Credit Card or Bank→Exchange with fees | Source/destination, fee classification, FX if cross-currency | Cash flow (transfer net zero), financing section |
| Credit Card | Purchases (domestic + foreign), interest, chargebacks | Merchant data, FX rate at swipe, liability balance | Spending trend, credit analysis, financing cash flow |

Scenario Summary

Time Period: January 2025 – December 2025 (12 months)

User Profile: Individual investor with multiple accounts and investment strategies

Currencies:

USD (primary)

VND (secondary)

Crypto assets (BTC, ETH)

Accounts:

Bank Account

Credit Card

Investment Account

Crypto Exchange

Investment Vault (vault-based strategy)

Transaction Categories and Types
1. Expense Tracking

Regular Expenses: Rent, utilities, groceries, dining, transportation

Business Expenses: Software subscriptions, office supplies, professional services

Irregular Expenses: Medical bills, car maintenance, travel

2. Credit Card Spending

Daily Purchases: Coffee, gas, online shopping

Large Purchases: Electronics, furniture, vacation

Recurring Bills: Streaming services, gym membership, insurance

Interest and Fees: Finance charges, late fees, foreign transaction fees

3. Investment Operations (Vault-Based)

Deposits: Multiple DCA (Dollar Cost Averaging) contributions into a vault

Withdrawals: Profit-taking and rebalancing from the vault

Value Updates: Mark-to-market valuation updates for accurate P&L

Performance Tracking: Time-weighted returns and ROI calculations per vault

4. Cryptocurrency Trading

Buy Operations: BTC and ETH purchases at different price points

Sell Operations: Profit-taking and tax-loss harvesting

Staking Rewards: Yield from staking PoS (proof-of-stake) assets

DeFi Operations: Lending, borrowing, and liquidity provision

5. Stock Investments

Stock Purchases: Individual stocks and ETFs

Dividend Income: Periodic dividend payments

Stock Sales: Position management and profit-taking

DRIP (Dividend Reinvestment): Automatic reinvestment of dividends

6. Other Asset Holdings

Savings Accounts: High-yield savings, CDs

Precious Metals: Gold, silver

Real Estate: REITs and direct property investments

Commodities: Oil, agricultural products

Detailed Transaction Timeline
January 2025 – Initial Setup
Account Initialization
{
  "transaction_id": "tx_001",
  "date": "2025-01-01",
  "type": "initial_deposit",
  "account": "Bank Account",
  "asset": "USD",
  "amount": 50000,
  "description": "Initial bank account funding"
}

Credit Card Setup
{
  "transaction_id": "cc_setup_001",
  "date": "2025-01-05",
  "type": "expense",
  "account": "Credit Card",
  "asset": "USD",
  "amount": 0,
  "description": "Credit card account initialization"
}

February 2025 – Regular Expenses
Monthly Rent
{
  "transaction_id": "exp_001",
  "date": "2025-02-01",
  "type": "expense",
  "account": "Bank Account",
  "asset": "USD",
  "amount": -2000,
  "category": "Housing",
  "tag": "Rent"
}

Groceries (Credit Card)
{
  "transaction_id": "cc_001",
  "date": "2025-02-03",
  "type": "expense",
  "account": "Credit Card",
  "asset": "USD",
  "amount": 150,
  "merchant": "Whole Foods",
  "category": "Food & Dining",
  "tag": "Groceries"
}

Credit Card Payment
{
  "transaction_id": "cc_pay_001",
  "date": "2025-02-25",
  "type": "transfer",
  "account": "Bank Account",
  "asset": "USD",
  "amount": -800,
  "description": "Credit card payment"
}

March 2025 – Investment Activities
Initial Crypto Investment
{
  "transaction_id": "crypto_buy_001",
  "date": "2025-03-01",
  "type": "buy",
  "account": "Crypto Exchange",
  "asset": "BTC",
  "quantity": 0.5,
  "price_usd": 65000,
  "total_cost": 32500
}

Vault Investment – First Deposit
{
  "transaction_id": "vault_deposit_001",
  "date": "2025-03-15",
  "type": "deposit",
  "account": "Investment Vault",
  "asset": "BTC",
  "quantity": 0.25,
  "price_usd": 67000,
  "investment_id": "vault_btc_001"
}

Stock Purchase
{
  "transaction_id": "stock_buy_001",
  "date": "2025-03-20",
  "type": "buy",
  "account": "Investment Account",
  "asset": "AAPL",
  "quantity": 50,
  "price_usd": 180,
  "total_cost": 9000
}

April 2025 – DCA Investment Strategy
Vault Investment – Second Deposit
{
  "transaction_id": "vault_deposit_002",
  "date": "2025-04-15",
  "type": "deposit",
  "account": "Investment Vault",
  "asset": "BTC",
  "quantity": 0.2,
  "price_usd": 62000,
  "investment_id": "vault_btc_001"
}

Crypto Buy – Market Dip
{
  "transaction_id": "crypto_buy_002",
  "date": "2025-04-20",
  "type": "buy",
  "account": "Crypto Exchange",
  "asset": "ETH",
  "quantity": 10,
  "price_usd": 2800,
  "total_cost": 28000
}

May 2025 – Staking and Rewards
Ethereum Staking
{
  "transaction_id": "stake_001",
  "date": "2025-05-01",
  "type": "stake",
  "account": "Crypto Exchange",
  "asset": "ETH",
  "quantity": 8,
  "price_usd": 3000
}

Staking Rewards
{
  "transaction_id": "reward_001",
  "date": "2025-05-15",
  "type": "reward",
  "account": "Crypto Exchange",
  "asset": "ETH",
  "quantity": 0.08,
  "description": "Staking rewards"
}

Stock Dividend Income
{
  "transaction_id": "dividend_001",
  "date": "2025-05-25",
  "type": "income",
  "account": "Investment Account",
  "asset": "AAPL",
  "amount": 25,
  "description": "AAPL dividend"
}

June 2025 – Market Volatility
Vault Investment – Third Deposit
{
  "transaction_id": "vault_deposit_003",
  "date": "2025-06-15",
  "type": "deposit",
  "account": "Investment Vault",
  "asset": "BTC",
  "quantity": 0.3,
  "price_usd": 58000,
  "investment_id": "vault_btc_001"
}

Crypto Sell – Profit Taking
{
  "transaction_id": "crypto_sell_001",
  "date": "2025-06-20",
  "type": "sell",
  "account": "Crypto Exchange",
  "asset": "BTC",
  "quantity": 0.2,
  "price_usd": 70000,
  "proceeds": 14000
}

July 2025 – Portfolio Rebalancing
Vault Withdrawal – Partial
{
  "transaction_id": "vault_withdraw_001",
  "date": "2025-07-10",
  "type": "withdraw",
  "account": "Investment Vault",
  "asset": "BTC",
  "quantity": 0.15,
  "price_usd": 65000,
  "investment_id": "vault_btc_001"
}

Portfolio Reinvestment
{
  "transaction_id": "rebalance_001",
  "date": "2025-07-15",
  "type": "buy",
  "account": "Investment Account",
  "asset": "SPY",
  "quantity": 20,
  "price_usd": 450,
  "total_cost": 9000
}

August 2025 – Value Adjustments
Market Value Update – Vault
{
  "transaction_id": "valuation_001",
  "date": "2025-08-01",
  "type": "valuation",
  "account": "Investment Vault",
  "asset": "BTC",
  "current_price": 62000,
  "quantity": 0.45,
  "market_value": 27900
}

Crypto Staking Rewards
{
  "transaction_id": "reward_002",
  "date": "2025-08-15",
  "type": "yield",
  "account": "Crypto Exchange",
  "asset": "ETH",
  "quantity": 0.12,
  "description": "ETH staking yield"
}

September 2025 – Tax Preparation
Tax-Loss Harvesting
{
  "transaction_id": "loss_harvest_001",
  "date": "2025-09-15",
  "type": "sell",
  "account": "Investment Account",
  "asset": "TSLA",
  "quantity": 25,
  "price_usd": 220,
  "loss_amount": -1250,
  "description": "Tax-loss harvesting"
}

Tax Payment
{
  "transaction_id": "tax_001",
  "date": "2025-09-30",
  "type": "tax",
  "account": "Bank Account",
  "asset": "USD",
  "amount": -2500,
  "description": "Quarterly estimated tax payment"
}

October 2025 – Year-End Planning
Harvest Gains
{
  "transaction_id": "gain_harvest_001",
  "date": "2025-10-15",
  "type": "sell",
  "account": "Crypto Exchange",
  "asset": "BTC",
  "quantity": 0.3,
  "price_usd": 68000,
  "proceeds": 20400,
  "gain_amount": 8500
}

RE Investment
{
  "transaction_id": "reinvest_001",
  "date": "2025-10-20",
  "type": "buy",
  "account": "Investment Account",
  "asset": "VNQ",
  "quantity": 100,
  "price_usd": 85,
  "total_cost": 8500
}

November 2025 – Holiday Season
Credit Card Spending Spree
{
  "transaction_id": "holiday_cc_001",
  "date": "2025-11-25",
  "type": "expense",
  "account": "Credit Card",
  "asset": "USD",
  "amount": 1200,
  "merchant": "Amazon",
  "category": "Shopping",
  "tag": "Holiday Gifts"
}

Credit Card Interest
{
  "transaction_id": "cc_interest_001",
  "date": "2025-11-30",
  "type": "interest_expense",
  "account": "Credit Card",
  "asset": "USD",
  "amount": 35,
  "description": "Credit card finance charges"
}

December 2025 – Year-End Summary
Final Vault Valuation
{
  "transaction_id": "year_end_valuation",
  "date": "2025-12-31",
  "type": "valuation",
  "account": "Investment Vault",
  "asset": "BTC",
  "current_price": 72000,
  "remaining_quantity": 0.25,
  "final_value": 18000
}

Year-End Performance Summary

Total Investments: $95,000

Current Portfolio Value: $156,000

Total Gains: $61,000 (64.2% ROI)

Realized Gains: $15,000

Unrealized Gains: $46,000

### Basic Usage Scenario Extensions

Each core flow is expanded with a lightweight, real-life variation that remains within everyday personal finance needs.

#### 1. Expense + Refund Cycle
- February groceries refunded in March due to damaged goods; refund keeps the original `fx_to_usd` captured at purchase time.
- Merchant reclassification (Food → Household) demonstrates tag correction without losing audit trail.
```json
{
  "transaction_id": "exp_refund_001",
  "date": "2025-03-05",
  "type": "refund",
  "account": "Credit Card",
  "asset": "USD",
  "amount": -75,
  "original_transaction": "cc_001",
  "price_source": "card_network",
  "fx_rate_source": "ECB",
  "fx_rate_timestamp": "2025-02-03T10:00:00Z"
}
```

#### 2. Vault DCA With Single Withdrawal
- Monthly BTC deposits continue through June even if a scheduled buy fails once; failure is logged with reason `PRICE_OUT_OF_RANGE`.
- A July withdrawal (profit lock) references the average cost basis up to that point.
```json
{
  "transaction_id": "vault_dca_004",
  "date": "2025-05-15",
  "type": "deposit",
  "account": "Investment Vault",
  "asset": "BTC",
  "quantity": 0.18,
  "price_usd": 60500,
  "price_source": "coinbase",
  "fx_rate_timestamp": "2025-05-15T09:00:00Z"
}
```

#### 3. Income + Savings Interest
- Salary hits on the 1st with employer-paid tax; gig payout on the 20th arrives in VND and is converted using the stored FX snapshot.
- Savings interest is credited end-of-month with optional early withdrawal penalty entry.
```json
{
  "transaction_id": "income_vnd_001",
  "date": "2025-04-20",
  "type": "income",
  "account": "Bank Account",
  "asset": "VND",
  "amount": 120000000,
  "fx_to_usd": 0.0000418,
  "fx_rate_source": "sbv_daily",
  "fx_rate_timestamp": "2025-04-20T12:00:00Z"
}
```

#### 4. Transfer + Credit Card Payment
- Bank → Credit Card payment shows transfer netting to zero globally while lowering liability.
- Foreign card purchase adds FX fee and later chargeback if disputed.
```json
{
  "transaction_id": "cc_foreign_001",
  "date": "2025-08-05",
  "type": "expense",
  "account": "Credit Card",
  "asset": "EUR",
  "amount": 220,
  "fx_to_usd": 1.09,
  "fx_fee_usd": 6,
  "price_source": "visa_fx",
  "fx_rate_timestamp": "2025-08-05T18:30:00Z"
}
```

Expected System Behavior
1. Holdings Reporting
Portfolio Composition (as of 2025-12-31)
{
  "portfolio_summary": {
    "total_value_usd": 156000,
    "total_value_vnd": 3744000000,
    "holdings": [
      {
        "asset": "BTC",
        "account": "Investment Vault",
        "quantity": 0.25,
        "value_usd": 18000,
        "percentage": 11.5
      },
      {
        "asset": "BTC",
        "account": "Crypto Exchange",
        "quantity": 0.1,
        "value_usd": 7200,
        "percentage": 4.6
      },
      {
        "asset": "ETH",
        "account": "Crypto Exchange",
        "quantity": 10.08,
        "value_usd": 7560,
        "percentage": 4.8
      },
      {
        "asset": "AAPL",
        "account": "Investment Account",
        "quantity": 50,
        "value_usd": 9500,
        "percentage": 6.1
      },
      {
        "asset": "SPY",
        "account": "Investment Account",
        "quantity": 20,
        "value_usd": 9200,
        "percentage": 5.9
      },
      {
        "asset": "VNQ",
        "account": "Investment Account",
        "quantity": 100,
        "value_usd": 8500,
        "percentage": 5.4
      },
      {
        "asset": "USD",
        "account": "Bank Account",
        "quantity": 85000,
        "value_usd": 85000,
        "percentage": 54.5
      },
      {
        "asset": "USD",
        "account": "Credit Card",
        "quantity": -1235,
        "value_usd": -1235,
        "percentage": -0.8
      }
    ]
  }
}

2. Cash Flow Reporting
Operating / Financing / Investing Cash Flow (2025)
{
  "cashflow_summary": {
    "operating": {
      "inflows": {
        "income": 5000,
        "dividends": 750,
        "interest": 200,
        "total": 5950
      },
      "outflows": {
        "expenses": -24000,
        "taxes": -2500,
        "fees": -500,
        "total": -27000
      },
      "net": -21050
    },
    "financing": {
      "inflows": {
        "credit_card_credit": 15000,
        "total": 15000
      },
      "outflows": {
        "credit_card_payment": -15000,
        "total": -15000
      },
      "net": 0
    },
    "investing": {
      "inflows": {
        "asset_sales": 35600,
        "total": 35600
      },
      "outflows": {
        "asset_purchases": -85000,
        "total": -85000
      },
      "net": -49400
    }
  }
}

3. Investment Performance
Vault Investment Performance
{
  "vault_performance": {
    "investment_id": "vault_btc_001",
    "asset": "BTC",
    "deposits": [
      {
        "date": "2025-03-15",
        "quantity": 0.25,
        "price": 67000,
        "cost": 16750
      },
      {
        "date": "2025-04-15",
        "quantity": 0.2,
        "price": 62000,
        "cost": 12400
      },
      {
        "date": "2025-06-15",
        "quantity": 0.3,
        "price": 58000,
        "cost": 17400
      }
    ],
    "withdrawals": [
      {
        "date": "2025-07-10",
        "quantity": 0.15,
        "price": 65000,
        "proceeds": 9750
      }
    ],
    "current_holdings": {
      "quantity": 0.45,
      "average_cost": 51889,
      "current_price": 72000,
      "market_value": 32400,
      "unrealized_gain": 9050,
      "roi_percentage": 38.8
    },
    "realized_pnl": 750,
    "total_pnl": 9800
  }
}

4. Credit Card Analysis
Credit Card Spending Analysis (2025)
{
  "credit_card_analysis": {
    "total_spending": 15680,
    "spending_by_category": {
      "Groceries": 2400,
      "Dining": 1800,
      "Shopping": 3500,
      "Transportation": 1200,
      "Entertainment": 800,
      "Bills": 4200,
      "Other": 1780
    },
    "payments_made": 15800,
    "interest_charges": 420,
    "average_balance": 850,
    "credit_utilization": 17.0,
    "payment_history": "Excellent"
  }
}

5. Multi-Currency Support
FX Impact Analysis
{
  "fx_impact": {
    "vnd_transactions": {
      "total_amount_vnd": 50000000,
      "fx_rate_used": 24000,
      "usd_equivalent": 2083.33,
      "average_fx_rate": 24000.5,
      "fx_variance": 0.02
    },
    "crypto_valuation": {
      "btc_usd_price": 72000,
      "btc_vnd_equivalent": 1728000000,
      "eth_usd_price": 750,
      "eth_vnd_equivalent": 18000000
    }
  }
}

System Requirements Validation
1. Transaction Type Coverage

✅ Broad Transaction Coverage: Expenses, income, transfers, buys, sells, staking, rewards, taxes, valuations, interest, fees, etc.

✅ Category Classification: Operating, investing, financing, transfer, valuation

✅ Subcategory Granularity: Merchant-level and tag-level breakdowns for detailed reporting

2. Decimal Precision

✅ Financial Calculations: All monetary amounts handled with high-precision decimal types

✅ FX Conversions: Multi-currency conversions using precise exchange rates

✅ P&L Calculations: Accurate realized and unrealized P&L tracking

3. Holdings Accuracy

✅ Real-Time Valuation: Current market prices applied to all mark-to-market assets

✅ Historical Tracking: All transactions timestamped and stored immutably

✅ Account Aggregation: Holdings aggregated across all accounts and asset types

✅ Allocation Percentages: Portfolio weights calculated as percentages of total value

4. Cash Flow Integrity

✅ Operating Cash Flow: Income vs. expenses, taxes, and fees

✅ Financing Cash Flow: Borrowing vs. repayment (e.g., credit card flows)

✅ Investing Cash Flow: Asset purchases vs. asset sales

✅ Internal Transfers: Transfers between user-owned accounts net to zero at the global level

5. Credit Card Flow Handling

✅ Liability Tracking: Credit card modeled as a liability account with running balance
✅ Payment Allocation: Payments from bank accounts reduce the liability and impact cash flow correctly

6. Vault Investment Management

✅ Multiple Deposits: Supports DCA into vault-based strategies

✅ Partial Withdrawals: Supports partial redemptions and profit-taking

✅ Value Updates: Mark-to-market valuation events for vault positions

✅ Performance Attribution: Time-weighted returns and cost-basis-aware P&L

7. Audit Trail Completeness

✅ Full Transaction History: Every change recorded as a transaction or audit event

✅ Change Tracking: Before/after values for critical updates

✅ User Attribution: User and system actor IDs on all mutating operations

✅ Data Integrity: Immutable audit log and referential integrity between entities

8. FX & Price Capture Correctness

✅ Acquisition Rule: At transaction creation, query the configured FX/price provider for the transaction timestamp; if no exact quote exists, fall back to the closest earlier quote and record `rate_lag_seconds`.

✅ Persistence Rule: Persist `fx_to_usd`, `fx_to_vnd`, `price_local`, `price_source`, and `fx_rate_timestamp` so downstream reports never re-fetch historical rates.

✅ Audit Rule: Manual overrides capture user, reason, original rate, new rate, and override timestamp.

✅ Validation Rule: Integration tests assert that stored FX equals the provider quote exposed via [`internal/services/fx_http.go`](backend/internal/services/fx_http.go) and [`internal/services/price_cache.go`](backend/internal/services/price_cache.go) at creation time.


### Flow-Specific Acceptance Criteria

| Flow | Acceptance criteria |
| --- | --- |
| Expense & Refund | 1) Expense entries must appear in monthly spending trend using the FX stored at capture time, 2) refunds negate the original amount but retain original FX to avoid retroactive drift, 3) reclassification updates reporting tags without altering audit history. |
| Vault Investment | 1) Each DCA deposit snapshots `price_local` + FX and updates cost basis, 2) withdrawals consume quantity in FIFO order referencing stored prices, 3) failed deposits log reason codes and do not affect holdings. |
| Income & Savings | 1) Salary and gig income record gross+net split plus FX timestamp, 2) savings interest inflows show up in cash flow interest bucket, 3) early withdrawal penalties post as expenses tied to the same account. |
| Transfers | 1) Bank→Credit Card payment reduces liability and nets to zero globally, 2) cross-currency transfers store both source and destination FX snapshots, 3) transfer fees classify as operating expenses with their own FX. |
| Credit Card | 1) Foreign purchases include `fx_fee_usd` and FX source, 2) interest accrues daily and lands in financing cash flow, 3) chargebacks reverse both spending trend and liability while keeping audit references. |

### Reporting Implications of Stored FX Snapshots
- **Holdings** revalue positions with latest market data but rely on stored quantities and historical FX for cost basis to avoid back-adjusting liability balances.
- **Cash Flow** maintains the original FX captured at transaction time so historical statements remain stable even if later rates change.
- **Investment Performance** computes realized/unrealized PnL by combining stored trade prices with current quotes; ROI tolerances must be within ±$0.01 USD and ±₫1 VND.
- **Spending Trend & Credit Analysis** always uses the FX snapshot taken at swipe time, ensuring category totals match statements from the originating financial institution.

### Testing Checklist Appendix
| Scenario ID | Description | Expected test coverage |
| --- | --- | --- |
| EXP-REF-01 | Expense + refund flow with tag correction and stored FX | [`backend/tests/integration/comprehensive_e2e_test.go`](backend/tests/integration/comprehensive_e2e_test.go), add assertion in spending section |
| VLT-DCA-01 | Vault DCA deposits, failed attempt, and withdrawal | [`backend/tests/integration/vault_regression_test.go`](backend/tests/integration/vault_regression_test.go) |
| INC-SAV-01 | Salary + VND gig income + savings interest | [`backend/tests/integration/cashflow_report_test.go`](backend/tests/integration/cashflow_report_test.go) |
| TRF-CC-01 | Bank→Credit Card transfer and FX cross-transfer | [`backend/tests/integration/transfer_test.go`](backend/tests/integration/transfer_test.go) |
| CC-FX-01 | Foreign card purchase with FX fee and chargeback | [`backend/tests/integration/credit_card_test.go`](backend/tests/integration/credit_card_test.go) |
| FX-VAL-01 | FX acquisition, persistence, and override audit | [`backend/tests/integration/advanced_reporting_test.go`](backend/tests/integration/advanced_reporting_test.go) + targeted unit tests in [`backend/internal/services/fx_http.go`](backend/internal/services/fx_http.go) |
