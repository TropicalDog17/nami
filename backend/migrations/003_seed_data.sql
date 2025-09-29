-- Seed data for transaction tracking system

-- Seed initial transaction types
INSERT INTO transaction_types (name, description) VALUES
('buy', 'Purchase of an asset'),
('sell', 'Sale of an asset'),
('deposit', 'Deposit into account or LP'),
('withdraw', 'Withdrawal from account or LP'),
('transfer_in', 'Transfer into account'),
('transfer_out', 'Transfer out of account'),
('expense', 'Expense or spending'),
('income', 'Income or earnings'),
('reward', 'Rewards or cashback'),
('airdrop', 'Token airdrop'),
('fee', 'Transaction or service fee'),
('lend', 'Lending transaction'),
('repay', 'Loan repayment received'),
('interest', 'Interest income'),
('borrow', 'Borrowing transaction'),
('repay_borrow', 'Loan repayment made'),
('interest_expense', 'Interest expense paid')
ON CONFLICT (name) DO NOTHING;

-- Seed common accounts
INSERT INTO accounts (name, type) VALUES
('Cash', 'Cash'),
('Bank', 'Bank'),
('CreditCard', 'CreditCard'),
('Binance Spot', 'Exchange'),
('Vault', 'Investment'),
('Friend A Loan', 'Peer')
ON CONFLICT (name) DO NOTHING;

-- Seed common assets
INSERT INTO assets (symbol, name, decimals) VALUES
('VND', 'Vietnamese Dong', 0),
('USD', 'US Dollar', 2),
('USDT', 'Tether USD', 6),
('BTC', 'Bitcoin', 8),
('ETH', 'Ethereum', 18)
ON CONFLICT (symbol) DO NOTHING;

-- Seed common tags
INSERT INTO tags (name, category) VALUES
('Food', 'Expense'),
('Housing', 'Expense'),
('Transport', 'Expense'),
('LP', 'Investment'),
('Staking', 'Investment'),
('Salary', 'Income'),
('Trading', 'Investment')
ON CONFLICT (name) DO NOTHING;

-- Seed sample transactions for demo
-- Include all NOT NULL derived columns to satisfy constraints
INSERT INTO transactions (
    date, type, asset, account, counterparty, tag, note,
    quantity, price_local, amount_local,
    fx_to_usd, fx_to_vnd, amount_usd, amount_vnd,
    fee_usd, fee_vnd,
    delta_qty, cashflow_usd, cashflow_vnd
) VALUES
-- Initial cash deposit
('2024-09-20', 'deposit', 'USD', 'Cash', NULL, NULL, 'Initial cash deposit',
 10000.00, 1.0, 10000.00,
 1.0, 24000.0, 10000.00, 240000000.0,
 0, 0,
 10000.00, 0, 0),

-- Buy some BTC
('2024-09-21', 'buy', 'BTC', 'Cash', 'Binance', 'Trading', 'Purchased BTC at market price',
 0.5, 60000.0, 30000.0,
 1.0, 24000.0, 30000.0, 720000000.0,
 0, 0,
 0.5, -30000.0, -720000000.0),

-- Buy some ETH
('2024-09-22', 'buy', 'ETH', 'Cash', 'Binance', 'Trading', 'Diversification purchase',
 5.0, 3000.0, 15000.0,
 1.0, 24000.0, 15000.0, 360000000.0,
 0, 0,
 5.0, -15000.0, -360000000.0),

-- Sell some BTC for profit
('2024-09-25', 'sell', 'BTC', 'Cash', 'Binance', 'Trading', 'Profit taking',
 0.2, 65000.0, 13000.0,
 1.0, 24000.0, 13000.0, 312000000.0,
 0, 0,
 -0.2, 13000.0, 312000000.0),

-- Expense transaction
('2024-09-26', 'expense', 'USD', 'Cash', 'Starbucks', 'Food', 'Coffee and snacks',
 50.0, 1.0, 50.0,
 1.0, 24000.0, 50.0, 1200000.0,
 0, 0,
 -50.0, -50.0, -1200000.0),

-- Income transaction
('2024-09-27', 'income', 'USD', 'Cash', 'Employer', 'Salary', 'Monthly salary payment',
 5000.0, 1.0, 5000.0,
 1.0, 24000.0, 5000.0, 120000000.0,
 0, 0,
 5000.0, 5000.0, 120000000.0)
ON CONFLICT DO NOTHING;
