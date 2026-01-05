# Nami Portfolio API Contract

## Overview

Nami Portfolio is a transaction-based portfolio management system with accounts, vaults, reporting, and pricing capabilities. The API provides REST endpoints for managing financial transactions, vaults/investments, loans, and generating comprehensive reports.

**Base URL:** `http://localhost:8080` (development) or `https://nami-backend-ashy.vercel.app` (production)

**API Version:** 1.0.0

**Content Type:** `application/json`

---

## Table of Contents

1. [Health & Status](#health--status)
2. [Transactions](#transactions)
3. [Vaults](#vaults)
4. [Loans](#loans)
5. [Reports](#reports)
6. [Actions](#actions)
7. [AI Endpoints](#ai-endpoints)
8. [Admin & Management](#admin--management)
9. [Prices & FX](#prices--fx)
10. [Data Models](#data-models)

---

## Health & Status

### GET /health
Health check endpoint.

**Response:** `200 OK`
```json
{
  "ok": true,
  "timestamp": "2025-01-05T12:00:00Z",
  "uptime": 123456
}
```

### GET /api/health
API health check endpoint.

**Response:** `200 OK`
```json
{
  "ok": true
}
```

---

## Transactions

### GET /api/transactions
List all transactions.

**Query Parameters:**
- `investment_id` (string, optional) - Filter by investment/vault ID

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "type": "INCOME|EXPENSE|INITIAL|BORROW|LOAN|REPAY|TRANSFER_OUT|TRANSFER_IN",
    "asset": { "type": "CRYPTO|FIAT", "symbol": "BTC" },
    "amount": 100.0,
    "createdAt": "2025-01-05T12:00:00Z",
    "account": "Bank Account",
    "note": "Salary",
    "category": "income",
    "tags": ["monthly"],
    "counterparty": "Employer",
    "dueDate": "2025-01-05T12:00:00Z",
    "transferId": "uuid",
    "loanId": "uuid",
    "sourceRef": "ref123",
    "rate": {
      "asset": { "type": "FIAT", "symbol": "USD" },
      "rateUSD": 42000.0,
      "timestamp": "2025-01-05T12:00:00Z",
      "source": "COINGECKO"
    },
    "usdAmount": 4200000.0,
    "direction": "BORROW|LOAN"
  }
]
```

### GET /api/transactions/:id
Get a specific transaction by ID.

**Response:** `200 OK` - Transaction object

### DELETE /api/transactions/:id
Delete a transaction by ID.

**Response:** `204 No Content` | `404 Not Found`

### POST /api/transactions/initial
Create initial holdings.

**Request Body:**
```json
{
  "items": [
    {
      "asset": { "type": "CRYPTO", "symbol": "BTC" },
      "amount": 1.5,
      "account": "Exchange Wallet",
      "note": "Initial balance",
      "at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

**Response:** `201 Created`
```json
{
  "created": 1,
  "transactions": [/* transaction objects */]
}
```

### POST /api/transactions/income
Create an income transaction.

**Request Body:**
```json
{
  "asset": { "type": "FIAT", "symbol": "USD" },
  "amount": 5000.0,
  "account": "Bank Account",
  "note": "Salary",
  "at": "2025-01-05T12:00:00Z",
  "category": "salary",
  "tags": ["monthly"],
  "counterparty": "Employer",
  "dueDate": "2025-01-05T12:00:00Z"
}
```

**Response:** `201 Created` - Transaction object

### POST /api/transactions/expense
Create an expense transaction.

**Request Body:** Same as `/transactions/income`

**Response:** `201 Created` - Transaction object

### POST /api/transactions/borrow
Create a borrow transaction (liability).

**Request Body:**
```json
{
  "asset": { "type": "FIAT", "symbol": "USD" },
  "amount": 1000.0,
  "account": "Credit Line",
  "counterparty": "Bank",
  "note": "Personal loan",
  "at": "2025-01-05T12:00:00Z"
}
```

**Response:** `201 Created` - Transaction object

### POST /api/transactions/loan
Create a loan transaction (receivable).

**Request Body:** Same as `/transactions/borrow`

**Response:** `201 Created` - Transaction object

### POST /api/transactions/repay
Create a repayment transaction.

**Request Body:**
```json
{
  "asset": { "type": "FIAT", "symbol": "USD" },
  "amount": 500.0,
  "direction": "BORROW|LOAN",
  "account": "Bank Account",
  "counterparty": "Bank",
  "note": "Loan repayment",
  "at": "2025-01-05T12:00:00Z"
}
```

**Response:** `201 Created` - Transaction object

### POST /api/transactions
Unified create endpoint supporting multiple transaction types.

**Supported types:** `deposit`, `withdraw`, `income`, `expense`, `buy`, `sell`

**Request Body Examples:**

**Deposit/Withdraw:**
```json
{
  "type": "deposit|withdraw",
  "asset": "USD",
  "quantity": 1000.0,
  "at": "2025-01-05T12:00:00Z",
  "account": "Savings",
  "note": "Initial deposit"
}
```

**Buy/Sell:**
```json
{
  "type": "buy|sell",
  "asset": "BTC",
  "quantity": 0.5,
  "unit_price_usd": 42000.0,
  "at": "2025-01-05T12:00:00Z",
  "account": "Exchange"
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "created": 1,
  "transactions": [/* transaction objects */]
}
```

---

## Vaults

Vaults are used to organize and track investments/funds with deposit/withdraw operations and valuations.

### GET /api/vaults
List vaults.

**Query Parameters:**
- `is_open` (boolean, optional) - Filter by active status
- `enrich` (boolean, optional) - Include vault statistics (AUM, ROI, etc.)
- `tokenized` (boolean, optional) - Return tokenized vault format

**Response:** `200 OK`
```json
[
  {
    "name": "Investment Vault",
    "status": "ACTIVE|CLOSED",
    "createdAt": "2025-01-01T00:00:00Z"
  }
]
```

**Enriched Response:**
```json
[
  {
    "id": "Investment Vault",
    "name": "Investment Vault",
    "status": "active|closed",
    "inception_date": "2025-01-01T00:00:00Z",
    "total_contributed_usd": 10000.0,
    "total_withdrawn_usd": 2000.0,
    "total_assets_under_management": 15000.0,
    "total_usd_manual": 0.0,
    "total_usd_market": 15000.0,
    "roi_realtime_percent": 50.0
  }
]
```

### POST /api/vaults
Create or ensure a vault exists.

**Request Body:**
```json
{
  "name": "Investment Vault"
}
```

**Response:** `201 Created` | `200 OK` - Vault object

### GET /api/vaults/:name
Get vault details by name.

**Query Parameters:**
- `tokenized` (boolean, optional) - Return tokenized vault format

**Response:** `200 OK`
```json
{
  "id": "Investment Vault",
  "is_vault": true,
  "vault_name": "Investment Vault",
  "vault_status": "active",
  "vault_ended_at": null,
  "asset": "USD",
  "account": "Investment Vault",
  "deposit_date": "2025-01-01T00:00:00Z",
  "deposit_qty": "10000.0",
  "deposit_cost": "10000.0",
  "deposit_unit_cost": "1",
  "withdrawal_qty": "2000.0",
  "withdrawal_value": "2000.0",
  "withdrawal_unit_price": "1",
  "pnl": "5000.0",
  "pnl_percent": "50.0",
  "is_open": true,
  "realized_pnl": "-8000.0",
  "remaining_qty": "15000.0",
  "total_usd_manual": "0.0",
  "total_usd_market": "15000.0",
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-05T12:00:00Z"
}
```

### GET /api/vaults/:name/transactions
List all vault entries (deposits, withdrawals, valuations).

**Response:** `200 OK`
```json
[
  {
    "vault": "Investment Vault",
    "type": "DEPOSIT|WITHDRAW|VALUATION",
    "asset": { "type": "FIAT", "symbol": "USD" },
    "amount": 1000.0,
    "usdValue": 1000.0,
    "at": "2025-01-05T12:00:00Z",
    "account": "Bank Account",
    "note": "Initial deposit"
  }
]
```

### GET /api/vaults/:name/holdings
Get vault holdings summary.

**Response:** `200 OK`
```json
{
  "total_shares": 1000.0,
  "total_aum": 15000.0,
  "total_usd_manual": 0.0,
  "total_usd_market": 15000.0,
  "share_price": 15.0,
  "transaction_count": 10,
  "last_transaction_at": "2025-01-05T12:00:00Z"
}
```

### POST /api/vaults/:name/deposit
Deposit assets into a vault.

**Request Body:**
```json
{
  "asset": { "type": "FIAT", "symbol": "USD" },
  "quantity": 1000.0,
  "cost": 1000.0,
  "at": "2025-01-05T12:00:00Z",
  "account": "Bank Account",
  "note": "Initial investment"
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "entry": { /* vault entry object */ }
}
```

### POST /api/vaults/:name/withdraw
Withdraw assets from a vault.

**Request Body:**
```json
{
  "asset": { "type": "FIAT", "symbol": "USD" },
  "quantity": 500.0,
  "value": 500.0,
  "at": "2025-01-05T12:00:00Z",
  "account": "Bank Account",
  "note": "Profit taking"
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "entry": { /* vault entry object */ }
}
```

### POST /api/vaults/:name/transfer
Transfer assets between vaults.

**Request Body:**
```json
{
  "to": "Target Vault",
  "asset": { "type": "FIAT", "symbol": "USD" },
  "quantity": 1000.0,
  "value": 1000.0,
  "at": "2025-01-05T12:00:00Z",
  "note": "Rebalancing"
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "from": "Source Vault",
  "to": "Target Vault",
  "asset": { "type": "FIAT", "symbol": "USD" },
  "amount": 1000.0,
  "usdValue": 1000.0,
  "withdrawEntry": { /* vault entry */ },
  "depositEntry": { /* vault entry */ }
}
```

### POST /api/vaults/:name/distribute-reward
Distribute reward/income from a vault to another account.

**Request Body:**
```json
{
  "amount": 500.0,
  "destination": "Spending Vault",
  "at": "2025-01-05T12:00:00Z",
  "note": "Monthly dividend",
  "new_total_usd": 15500.0,
  "mark": true,
  "create_income": false
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "source": "Investment Vault",
  "destination": "Spending Vault",
  "reward_usd": 500.0,
  "marked_to": 15500.0
}
```

### POST /api/vaults/:name/refresh
Manually refresh/update vault valuation.

**Request Body:**
```json
{
  "current_value_usd": 16000.0,
  "persist": false
}
```

**Response:** `200 OK`
```json
{
  "as_of": "2025-01-05T12:00:00Z",
  "current_value_usd": 16000.0,
  "current_value_market": 16000.0,
  "total_aum": 32000.0,
  "roi_realtime_percent": 220.0,
  "apr_percent": 220.0
}
```

### POST /api/vaults/:name/end
End/close a vault.

**Response:** `200 OK` | `404 Not Found`

### DELETE /api/vaults/:name
Delete a vault.

**Response:** `200 OK` | `404 Not Found`

---

## Loans

### GET /api/loans
List all loan agreements.

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "counterparty": "Friend",
    "asset": { "type": "FIAT", "symbol": "USD" },
    "principal": 1000.0,
    "interestRate": 0.05,
    "period": "MONTH",
    "startAt": "2025-01-01T00:00:00Z",
    "maturityAt": "2025-12-31T23:59:59Z",
    "note": "Personal loan",
    "account": "Bank Account",
    "status": "ACTIVE|CLOSED",
    "createdAt": "2025-01-01T00:00:00Z",
    "principalPaid": 200.0,
    "interestPaid": 50.0,
    "outstandingPrincipal": 800.0
  }
]
```

### POST /api/loans
Create a new loan agreement.

**Request Body (Single):**
```json
{
  "asset": { "type": "FIAT", "symbol": "USD" },
  "principal": 1000.0,
  "counterparty": "Friend",
  "interestRate": 0.05,
  "period": "DAY|MONTH|YEAR",
  "startAt": "2025-01-01T00:00:00Z",
  "maturityAt": "2025-12-31T23:59:59Z",
  "account": "Bank Account",
  "note": "Personal loan"
}
```

**Request Body (Batch):**
```json
{
  "items": [
    { /* loan create object */ },
    { /* loan create object */ }
  ]
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "loan": { /* loan object */ },
  "transaction": { /* transaction object */ }
}
```

### GET /api/loans/:id
Get loan agreement details.

**Response:** `200 OK` - Loan object with payments and outstanding balance

### POST /api/loans/:id/repay
Record a principal repayment.

**Request Body:**
```json
{
  "amount": 200.0,
  "at": "2025-02-01T12:00:00Z",
  "account": "Bank Account",
  "note": "Monthly payment"
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "transaction": { /* transaction object */ }
}
```

### POST /api/loans/:id/interest
Record an interest payment (for loans issued/receivables).

**Request Body:**
```json
{
  "amount": 50.0,
  "at": "2025-02-01T12:00:00Z",
  "account": "Bank Account",
  "note": "Monthly interest"
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "transaction": { /* transaction object */ }
}
```

---

## Reports

### GET /api/reports/holdings
Get portfolio holdings by asset and account.

**Response:** `200 OK`
```json
[
  {
    "asset": "BTC",
    "account": "Exchange Wallet",
    "quantity": 1.5,
    "value_usd": 63000.0,
    "value_vnd": 1512000000.0,
    "percentage": 45.0,
    "last_updated": "2025-01-05T12:00:00Z"
  }
]
```

### GET /api/reports/holdings/summary
Get holdings summary aggregated by asset.

**Response:** `200 OK`
```json
{
  "by_asset": {
    "BTC": {
      "quantity": 1.5,
      "value_usd": 63000.0,
      "value_vnd": 1512000000.0,
      "percentage": 45.0
    },
    "USD": {
      "quantity": 50000.0,
      "value_usd": 50000.0,
      "value_vnd": 1200000000.0,
      "percentage": 55.0
    }
  },
  "total_value_usd": 113000.0,
  "total_value_vnd": 2712000000.0,
  "last_updated": "2025-01-05T12:00:00Z"
}
```

### GET /api/reports/cashflow
Get cashflow report.

**Query Parameters:**
- `start_date` (date, optional) - Start date (YYYY-MM-DD)
- `end_date` (date, optional) - End date (YYYY-MM-DD)
- `account` (string, optional) - Filter by account/vault

**Response:** `200 OK`
```json
{
  "combined_in_usd": 10000.0,
  "combined_in_vnd": 240000000.0,
  "combined_out_usd": 5000.0,
  "combined_out_vnd": 120000000.0,
  "combined_net_usd": 5000.0,
  "combined_net_vnd": 120000000.0,

  "total_in_usd": 10000.0,
  "total_out_usd": 5000.0,
  "net_usd": 5000.0,
  "total_in_vnd": 240000000.0,
  "total_out_vnd": 120000000.0,
  "net_vnd": 120000000.0,

  "operating_in_usd": 10000.0,
  "operating_in_vnd": 240000000.0,
  "operating_out_usd": 5000.0,
  "operating_out_vnd": 120000000.0,
  "operating_net_usd": 5000.0,
  "operating_net_vnd": 120000000.0,

  "financing_in_usd": 0.0,
  "financing_in_vnd": 0.0,
  "financing_out_usd": 0.0,
  "financing_out_vnd": 0.0,
  "financing_net_usd": 0.0,
  "financing_net_vnd": 0.0,

  "by_type": {
    "deposit": {
      "inflow_usd": 10000.0,
      "outflow_usd": 0.0,
      "net_usd": 10000.0,
      "inflow_vnd": 240000000.0,
      "outflow_vnd": 0.0,
      "net_vnd": 240000000.0,
      "count": 5
    }
  },

  "account": "Spending",
  "start_date": "2025-01-01",
  "end_date": "2025-01-31"
}
```

### GET /api/reports/spending
Get spending analysis.

**Query Parameters:**
- `start` (date, optional) - Start date (YYYY-MM-DD)
- `end` (date, optional) - End date (YYYY-MM-DD)
- `account` (string, optional) - Filter by account/vault

**Response:** `200 OK`
```json
{
  "total_usd": 3000.0,
  "total_vnd": 72000000.0,
  "by_tag": {
    "food": {
      "total_usd": 500.0,
      "total_vnd": 12000000.0,
      "count": 20,
      "amount_usd": 500.0,
      "amount_vnd": 12000000.0,
      "percentage": 16.67
    }
  },
  "daily": [
    {
      "date": "2025-01-01",
      "total_usd": 100.0,
      "total_vnd": 2400000.0
    }
  ],
  "by_day": {
    "2025-01-01": {
      "amount_usd": 100.0,
      "amount_vnd": 2400000.0
    }
  },
  "account": "Spending",
  "current_month_usd": 2000.0,
  "current_month_vnd": 48000000.0,
  "last_month_usd": 1800.0,
  "last_month_vnd": 43200000.0,
  "mom_change_usd": 200.0,
  "mom_change_percent": 11.11,
  "monthly_trend": [
    {
      "month": "2024-02",
      "amount_usd": 2500.0,
      "amount_vnd": 60000000.0
    }
  ],
  "avg_daily_usd": 66.67,
  "avg_daily_vnd": 1600000.0,
  "available_balance_usd": 5000.0,
  "available_balance_vnd": 120000000.0
}
```

### GET /api/reports/pnl
Get profit and loss report.

**Response:** `200 OK`
```json
{
  "realized_pnl_usd": 0.0,
  "realized_pnl_vnd": 0.0,
  "total_pnl_usd": 0.0,
  "total_pnl_vnd": 0.0,
  "roi_percent": 0.0,
  "by_asset": {}
}
```

### GET /api/reports/vaults/:name/header
Get vault header metrics (AUM, PnL, ROI, APR).

**Response:** `200 OK`
```json
{
  "vault": "Investment Vault",
  "aum_usd": 15000.0,
  "pnl_usd": 5000.0,
  "roi_percent": 50.0,
  "apr_percent": 72.0,
  "last_valuation_usd": 15000.0,
  "net_flow_since_valuation_usd": 0.0,
  "deposits_cum_usd": 10000.0,
  "withdrawals_cum_usd": 2000.0,
  "as_of": "2025-01-05T12:00:00Z"
}
```

### GET /api/reports/vaults/:name/series
Get vault daily time series (AUM, PnL, ROI, APR over time).

**Query Parameters:**
- `start` (date, optional) - Start date (YYYY-MM-DD)
- `end` (date, optional) - End date (YYYY-MM-DD)

**Response:** `200 OK`
```json
{
  "vault": "Investment Vault",
  "series": [
    {
      "date": "2025-01-01",
      "aum_usd": 10000.0,
      "aum_vnd": 240000000.0,
      "deposits_cum_usd": 10000.0,
      "withdrawals_cum_usd": 0.0,
      "pnl_usd": 0.0,
      "pnl_vnd": 0.0,
      "roi_percent": 0.0,
      "apr_percent": 0.0
    }
  ]
}
```

### GET /api/reports/vaults/summary
Get summary of latest metrics for all vaults.

**Response:** `200 OK`
```json
{
  "rows": [
    {
      "vault": "Investment Vault",
      "aum_usd": 15000.0,
      "aum_vnd": 360000000.0,
      "pnl_usd": 5000.0,
      "pnl_vnd": 120000000.0,
      "roi_percent": 50.0,
      "apr_percent": 72.0
    }
  ],
  "totals": {
    "aum_usd": 30000.0,
    "aum_vnd": 720000000.0,
    "pnl_usd": 10000.0,
    "pnl_vnd": 240000000.0
  }
}
```

### GET /api/reports/series
Get aggregated time series across all vaults (or specific vault).

**Query Parameters:**
- `account` (string, optional) - Filter by vault name
- `start` (date, optional) - Start date (YYYY-MM-DD)
- `end` (date, optional) - End date (YYYY-MM-DD)

**Response:** `200 OK`
```json
{
  "account": "ALL",
  "series": [
    {
      "date": "2025-01-01",
      "aum_usd": 20000.0,
      "aum_vnd": 480000000.0,
      "deposits_cum_usd": 20000.0,
      "withdrawals_cum_usd": 0.0,
      "pnl_usd": 0.0,
      "pnl_vnd": 0.0,
      "roi_percent": 0.0,
      "apr_percent": 0.0
    }
  ]
}
```

---

## Actions

### POST /api/actions
Execute financial actions.

**Request Body:**
```json
{
  "action": "spot_buy|init_balance|transfer",
  "params": { /* action-specific parameters */ }
}
```

#### Action: spot_buy
Execute a spot buy order.

**Parameters:**
```json
{
  "date": "2025-01-05",
  "exchange_account": "Binance",
  "base_asset": "BTC",
  "quote_asset": "USD",
  "quantity": 0.5,
  "price_quote": 42000.0,
  "fee_percent": 0.1
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "created": 2,
  "transactions": [
    { /* INCOME transaction for base asset */ },
    { /* EXPENSE transaction for quote asset */ }
  ]
}
```

#### Action: init_balance
Initialize account balance.

**Parameters:**
```json
{
  "date": "2025-01-01",
  "account": "Bank Account",
  "asset": "USD",
  "quantity": 10000.0,
  "price_local": 1.0,
  "note": "Initial balance"
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "created": 1,
  "transactions": [/* INITIAL transaction */]
}
```

#### Action: transfer
Transfer assets between accounts.

**Parameters:**
```json
{
  "date": "2025-01-05",
  "from_account": "Bank",
  "to_account": "Exchange",
  "asset": "USD",
  "quantity": 1000.0,
  "to_asset": "USD",
  "to_amount": 1000.0,
  "fee": 5.0,
  "note": "Funding transfer"
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "created": 3,
  "transactions": [
    { /* TRANSFER_OUT transaction */ },
    { /* TRANSFER_IN transaction */ },
    { /* EXPENSE transaction for fee (if applicable) */ }
  ]
}
```

---

## AI Endpoints

These endpoints are used by the AI service for recording transactions with automatic vault selection.

### POST /api/ai/expense-vnd
Record an expense in VND.

**Request Body:**
```json
{
  "vnd_amount": 100000.0,
  "date": "2025-01-05",
  "counterparty": "Store",
  "tag": "groceries",
  "note": "Weekly shopping",
  "source_ref": "txn123"
}
```

**Response:** `201 Created` or `200 OK` (if duplicate)
```json
{
  "ok": true,
  "duplicate": false,
  "transaction_id": "uuid",
  "account_used": "Spending"
}
```

### POST /api/ai/income-vnd
Record income in VND.

**Request Body:** Same as `/api/ai/expense-vnd`

**Response:** `201 Created` - Same format as expense

### POST /api/ai/credit-expense-vnd
Record a credit card expense in VND.

**Request Body:**
```json
{
  "vnd_amount": 500000.0,
  "date": "2025-01-05",
  "counterparty": "Amazon",
  "tag": "shopping",
  "note": "Online purchase",
  "credit_account": "Credit Card",
  "source_ref": "txn456"
}
```

**Response:** `201 Created` - Same format as expense

### POST /api/ai/card-payment-vnd
Record a credit card payment.

**Request Body:**
```json
{
  "vnd_amount": 2000000.0,
  "date": "2025-01-05",
  "from_account": "Bank Account",
  "to_credit_account": "Credit Card",
  "note": "Monthly payment"
}
```

**Response:** `201 Created`
```json
{
  "ok": true,
  "transaction_id": "uuid",
  "account_used": "Spending"
}
```

### GET /api/ai/settings
Get current vault settings for AI service.

**Response:** `200 OK`
```json
{
  "default_spending_vault": "Spending",
  "default_income_vault": "Income"
}
```

---

## Admin & Management

### Settings

### GET /api/admin/settings
Get system settings.

**Response:** `200 OK`
```json
{
  "default_spending_vault": "Spending",
  "default_income_vault": "Income",
  "borrowing_vault": "Credit",
  "borrowing_monthly_rate": 0.02,
  "borrowing_last_accrual_at": "2025-01-01T00:00:00Z"
}
```

### POST /api/admin/settings/spending-vault
Set default spending vault.

**Request Body:**
```json
{
  "name": "Spending"
}
```

**Response:** `200 OK`
```json
{
  "default_spending_vault": "Spending"
}
```

### POST /api/admin/settings/income-vault
Set default income vault.

**Request Body:**
```json
{
  "name": "Income"
}
```

**Response:** `200 OK`
```json
{
  "default_income_vault": "Income"
}
```

### Transaction Types

### GET /api/admin/types
List all transaction types.

**Response:** `200 OK` - Array of type objects

### GET /api/admin/types/:id
Get specific transaction type.

**Response:** `200 OK` - Type object

### POST /api/admin/types
Create transaction type.

**Request Body:**
```json
{
  "name": "groceries",
  "description": "Grocery shopping",
  "is_active": true
}
```

**Response:** `201 Created` - Type object

### PUT /api/admin/types/:id
Update transaction type.

**Request Body:** Partial type object

**Response:** `200 OK` - Updated type object

### DELETE /api/admin/types/:id
Delete transaction type.

**Response:** `200 OK`
```json
{
  "deleted": 1
}
```

### Accounts

### GET /api/admin/accounts
List all accounts.

**Response:** `200 OK` - Array of account objects

### GET /api/admin/accounts/:id
Get specific account.

**Response:** `200 OK` - Account object

### POST /api/admin/accounts
Create account.

**Request Body:**
```json
{
  "name": "Bank Account",
  "type": "checking",
  "is_active": true
}
```

**Response:** `201 Created` - Account object

### PUT /api/admin/accounts/:id
Update account.

**Response:** `200 OK` - Updated account object

### DELETE /api/admin/accounts/:id
Delete account.

**Response:** `200 OK`
```json
{
  "deleted": 1
}
```

### Assets

### GET /api/admin/assets
List all assets.

**Response:** `200 OK` - Array of asset objects

### GET /api/admin/assets/:id
Get specific asset.

**Response:** `200 OK` - Asset object

### POST /api/admin/assets
Create asset.

**Request Body:**
```json
{
  "symbol": "BTC",
  "name": "Bitcoin",
  "decimals": 8,
  "is_active": true
}
```

**Response:** `201 Created` - Asset object

### PUT /api/admin/assets/:id
Update asset.

**Response:** `200 OK` - Updated asset object

### DELETE /api/admin/assets/:id
Delete asset.

**Response:** `200 OK`
```json
{
  "deleted": 1
}
```

### Tags

### GET /api/admin/tags
List all tags.

**Response:** `200 OK` - Array of tag objects

### GET /api/admin/tags/:id
Get specific tag.

**Response:** `200 OK` - Tag object

### POST /api/admin/tags
Create tag.

**Request Body:**
```json
{
  "name": "travel",
  "category": "expense",
  "is_active": true
}
```

**Response:** `201 Created` - Tag object

### PUT /api/admin/tags/:id
Update tag.

**Response:** `200 OK` - Updated tag object

### DELETE /api/admin/tags/:id
Delete tag.

**Response:** `200 OK`
```json
{
  "deleted": 1
}
```

### AI Pending Actions

### GET /api/admin/pending-actions
List pending AI actions.

**Query Parameters:**
- `status` (string, optional) - Filter by status (pending|accepted|rejected)

**Response:** `200 OK` - Array of pending action objects

### GET /api/admin/pending-actions/:id
Get specific pending action.

**Response:** `200 OK` - Pending action object

### POST /api/admin/pending-actions
Create pending action.

**Request Body:**
```json
{
  "source": "telegram",
  "raw_input": "Spent 100k VND on groceries",
  "toon_text": "Parse result",
  "action_json": {
    "action": "spend_vnd",
    "params": {
      "vnd_amount": 100000.0,
      "date": "2025-01-05",
      "counterparty": "Store",
      "tag": "groceries",
      "note": "Weekly shopping"
    }
  },
  "confidence": 0.95,
  "batch_id": "batch123",
  "meta": {}
}
```

**Response:** `201 Created` - Pending action object

### POST /api/admin/pending-actions/:id/accept
Accept and execute a pending action.

**Response:** `200 OK`
```json
{
  "ok": true,
  "item": { /* updated pending action */ }
}
```

### POST /api/admin/pending-actions/:id/reject
Reject a pending action.

**Response:** `200 OK`
```json
{
  "ok": true,
  "item": { /* updated pending action */ }
}
```

### DELETE /api/admin/pending-actions/:id
Delete a pending action.

**Response:** `200 OK`
```json
{
  "deleted": 1
}
```

### POST /api/admin/pending-actions/accept-all
Accept all pending actions (optionally filtered by batch).

**Query Parameters:**
- `batch_id` (string, optional) - Filter by batch ID

**Response:** `200 OK`
```json
{
  "ok": true,
  "accepted": 10,
  "skipped": 2
}
```

### POST /api/admin/pending-actions/reject-all
Reject all pending actions (optionally filtered by batch).

**Query Parameters:**
- `batch_id` (string, optional) - Filter by batch ID

**Response:** `200 OK`
```json
{
  "ok": true,
  "rejected": 5
}
```

### DELETE /api/admin/pending-actions
Bulk delete pending actions by status.

**Query Parameters:**
- `status` (string, required) - Filter by status (pending|accepted|rejected)
- `batch_id` (string, optional) - Filter by batch ID

**Response:** `200 OK`
```json
{
  "ok": true,
  "deleted": 20
}
```

### Data Export/Import

### GET /api/admin/export
Export all data for migration.

**Response:** `200 OK`
```json
{
  "version": 1,
  "exported_at": "2025-01-05T12:00:00Z",
  "transactions": [/* transaction objects */],
  "vaults": [/* vault objects with entries */],
  "loans": [/* loan objects */],
  "types": [/* type objects */],
  "accounts": [/* account objects */],
  "assets": [/* asset objects */],
  "tags": [/* tag objects */],
  "pending_actions": [/* pending action objects */],
  "settings": {
    "default_spending_vault": "Spending",
    "default_income_vault": "Income",
    "borrowing": { /* borrowing settings */ }
  }
}
```

### POST /api/admin/import
Import data for migration.

**Request Body:** Same format as export response

**Response:** `200 OK`
```json
{
  "ok": true,
  "imported": {
    "transactions": 100,
    "vaults": 5,
    "vault_entries": 50,
    "loans": 3,
    "types": 10,
    "accounts": 8,
    "assets": 15,
    "tags": 20,
    "pending_actions": 2
  }
}
```

---

## Prices & FX

### GET /api/prices/daily
Get daily price for an asset.

**Query Parameters:**
- `symbol` (string, required) - Asset symbol (e.g., BTC)
- `currency` (string, optional) - Quote currency (default: USD)
- `start` (date, optional) - Start date (YYYY-MM-DD)
- `end` (date, optional) - End date (YYYY-MM-DD)

**Response:** `200 OK`
```json
[
  {
    "date": "2025-01-05",
    "price": 42000.0
  }
]
```

### GET /api/fx/today
Get current FX rate.

**Query Parameters:**
- `from` (string, optional) - Source currency (default: USD)
- `to` (string, optional) - Target currency (default: USD)

**Response:** `200 OK`
```json
{
  "from": "USD",
  "to": "VND",
  "rate": 24000.0,
  "date": "2025-01-05"
}
```

### GET /api/fx/history
Get FX rate history.

**Query Parameters:**
- `from` (string, optional) - Source currency (default: USD)
- `to` (string, optional) - Target currency (default: USD)
- `start` (date, optional) - Start date (YYYY-MM-DD, default: today)
- `end` (date, optional) - End date (YYYY-MM-DD, default: start)

**Response:** `200 OK`
```json
[
  {
    "date": "2025-01-01",
    "rate": 23800.0,
    "from": "USD",
    "to": "VND"
  },
  {
    "date": "2025-01-02",
    "rate": 23900.0,
    "from": "USD",
    "to": "VND"
  }
]
```

---

## Data Models

### Asset
```typescript
{
  type: "CRYPTO" | "FIAT",
  symbol: string  // e.g., BTC, ETH, USD, VND
}
```

### Rate
```typescript
{
  asset: Asset,
  rateUSD: number,           // 1 asset -> USD
  timestamp: string,         // ISO datetime
  source: "COINGECKO" | "EXCHANGE_RATE_HOST" | "FRANKFURTER" | "ER_API" | "FALLBACK" | "FIXED"
}
```

### Transaction
```typescript
{
  id: string,                // UUID
  type: "INITIAL" | "INCOME" | "EXPENSE" | "BORROW" | "LOAN" | "REPAY" | "TRANSFER_OUT" | "TRANSFER_IN",
  asset: Asset,
  amount: number,            // positive value in asset units
  createdAt: string,         // ISO datetime
  account?: string,          // optional account/source
  note?: string,
  category?: string,         // primary category/tag
  tags?: string[],           // additional tags
  counterparty?: string,     // merchant, payee, etc.
  dueDate?: string,          // ISO datetime for due date
  transferId?: string,       // links TRANSFER_OUT/IN pairs
  loanId?: string,           // link to loan agreement
  sourceRef?: string,        // external reference for deduplication
  rate: Rate,
  usdAmount: number,         // amount * rateUSD
  direction?: "BORROW" | "LOAN"  // for REPAY transactions
}
```

### Vault
```typescript
{
  name: string,
  status: "ACTIVE" | "CLOSED",
  createdAt: string          // ISO datetime
}
```

### VaultEntry
```typescript
{
  vault: string,             // vault name
  type: "DEPOSIT" | "WITHDRAW" | "VALUATION",
  asset: Asset,
  amount: number,            // in asset units
  usdValue: number,          // valuation at time
  at: string,                // ISO datetime
  account?: string,
  note?: string
}
```

### LoanAgreement
```typescript
{
  id: string,                // UUID
  counterparty: string,
  asset: Asset,
  principal: number,         // original principal
  interestRate: number,      // rate per period (e.g., 0.02 = 2%)
  period: "DAY" | "MONTH" | "YEAR",
  startAt: string,           // ISO datetime
  maturityAt?: string,       // optional maturity date
  note?: string,
  account?: string,
  status: "ACTIVE" | "CLOSED",
  createdAt: string          // ISO datetime
}
```

---

## Error Responses

All endpoints may return error responses in the following format:

### 400 Bad Request
```json
{
  "error": "Invalid request: ..."
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error: ..."
}
```

---

## Authentication

### AI Service Signature Verification

AI endpoints (`/api/ai/*`) support optional HMAC signature verification when `BACKEND_SIGNING_SECRET` environment variable is set.

**Header:** `X-AI-Signature: <hmac-sha256-hex>`

**Signature Calculation:**
```javascript
const crypto = require('crypto');
const payload = JSON.stringify(requestBody);
const signature = crypto
  .createHmac('sha256', process.env.BACKEND_SIGNING_SECRET)
  .update(payload)
  .digest('hex');
```

---

## Common Patterns

### Date/Time Format
All datetime fields use ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`

Date-only fields use: `YYYY-MM-DD`

### Pagination
Most list endpoints do not currently implement pagination. They return all available data. Future versions may add cursor-based pagination for large datasets.

### Deduplication
Transaction creation supports deduplication via the `sourceRef` field. If a transaction with the same `sourceRef`, `date`, `amount`, `type`, and `account` exists, the existing transaction is returned instead of creating a duplicate.

### Rate Limiting
Rate limiting is not currently implemented but may be added in future versions.

---

## Versioning

The API is currently at version 1.0.0. Major version changes will be reflected in the URL path (e.g., `/api/v2/...`). Backward compatibility will be maintained for at least one major version.

---

## Support & Documentation

For questions, issues, or feature requests, please refer to the project repository or documentation.
