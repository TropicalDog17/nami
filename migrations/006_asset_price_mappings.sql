-- Mapping assets to external price providers and default quote currency
CREATE TABLE IF NOT EXISTS asset_price_mappings (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,           -- e.g., coingecko
    provider_id VARCHAR(100) NOT NULL,       -- e.g., ethereum
    quote_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    is_popular BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(asset_id, provider)
);


