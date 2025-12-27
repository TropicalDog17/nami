High-Level Overview: Comprehensive Financial Tracking Requirements
Purpose

Create an enhanced financial transaction system capable of tracking all personal finance activities—expenses, credit cards, investments, crypto, stocks, and multi-currency flows—to produce accurate holdings, cash flow, and performance reports.

Core Functional Areas
1. Expense Tracking

Supports daily, recurring, irregular, and business expenses.

Refunds reverse original amounts while preserving historical FX.

Categories and tags drive spending analytics.

2. Credit Card Management

Tracks purchases (domestic and foreign), fees, interest, and disputes.

Payments reduce liability.

FX fees and swipe-time exchange rates are stored.

Provides spending analysis, utilization, and balance history.

3. Investment Operations

Vault-Based Investments

DCA deposits, withdrawals, cost-basis tracking.

Performance metrics such as ROI and time-weighted returns.

Crypto


4. Transfers

Includes Bank ↔ Credit Card, Bank ↔ Exchange.

Cross-currency transfers store source + destination FX.

Global net effect is zero.

Fees treated as operating expenses.

5. Income + Savings

Salary, freelance income in foreign currency, interest.

Captures gross/net split.

FX snapshot stored at time of earning.

System-Wide Rules
Transactions

All operations represented as immutable transactions.

Supports high-precision decimals for all monetary values.

FX & Price Handling

FX and market prices captured at transaction time.

Stored snapshots are never recalculated.

Holdings

Aggregates across all accounts and asset types.

Real-time value uses latest prices; cost basis uses stored prices.

Cash Flow

Categorized as operating, investing, or financing.

Transfers net to zero in global view.

Investment Performance

Uses stored price + FX for realized/unrealized PnL.

Supports time-weighted and ROI calculations.

Scenario Coverage (High-Level)

A year-long simulation (Jan–Dec 2025) covers:

Initial funding and credit card setup

Monthly expenses and credit card usage

Crypto buys, staking rewards, sells

Vault DCA deposits + withdrawals

Monthly income, investments(vault-based), deposit, withdraw
