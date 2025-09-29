-- Asset prices cache for crypto and other assets
CREATE TABLE IF NOT EXISTS asset_prices (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,            -- e.g., BTC, ETH, GOLD
    currency VARCHAR(10) NOT NULL,          -- e.g., USD, VND
    price DECIMAL(20,8) NOT NULL,
    date DATE NOT NULL,
    source VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(symbol, currency, date, source)
);


