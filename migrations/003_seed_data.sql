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
INSERT INTO transactions (date, type, asset, account, quantity, price_local, fx_to_usd, fx_to_vnd, counterparty, tag, note) VALUES
-- Initial cash deposit
('2024-09-20', 'deposit', 'USD', 'Cash', 10000.00, 1.0, 1.0, 24000.0, NULL, NULL, 'Initial cash deposit'),

-- Buy some BTC
('2024-09-21', 'buy', 'BTC', 'Cash', 0.5, 60000.0, 1.0, 24000.0, 'Binance', 'Trading', 'Purchased BTC at market price'),

-- Buy some ETH
('2024-09-22', 'buy', 'ETH', 'Cash', 5.0, 3000.0, 1.0, 24000.0, 'Binance', 'Trading', 'Diversification purchase'),

-- Sell some BTC for profit
('2024-09-25', 'sell', 'BTC', 'Cash', 0.2, 65000.0, 1.0, 24000.0, 'Binance', 'Trading', 'Profit taking'),

-- Expense transaction
('2024-09-26', 'expense', 'USD', 'Cash', 50.0, 1.0, 1.0, 24000.0, 'Starbucks', 'Food', 'Coffee and snacks'),

-- Income transaction
('2024-09-27', 'income', 'USD', 'Cash', 5000.0, 1.0, 1.0, 24000.0, 'Employer', 'Salary', 'Monthly salary payment')
ON CONFLICT DO NOTHING;
