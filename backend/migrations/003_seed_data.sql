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
('interest_expense', 'Interest expense paid'),
('stake', 'Staking transaction'),
('unstake', 'Unstaking transaction')
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