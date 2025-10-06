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

-- Seed default price mappings for popular crypto assets
-- Assumes assets with these symbols already exist in `assets`

INSERT INTO asset_price_mappings (asset_id, provider, provider_id, quote_currency, is_popular)
SELECT a.id, 'coingecko', 'bitcoin', 'USD', TRUE FROM assets a WHERE a.symbol = 'BTC'
ON CONFLICT (asset_id, provider) DO NOTHING;

INSERT INTO asset_price_mappings (asset_id, provider, provider_id, quote_currency, is_popular)
SELECT a.id, 'coingecko', 'ethereum', 'USD', TRUE FROM assets a WHERE a.symbol = 'ETH'
ON CONFLICT (asset_id, provider) DO NOTHING;

INSERT INTO asset_price_mappings (asset_id, provider, provider_id, quote_currency, is_popular)
SELECT a.id, 'coingecko', 'tether', 'USD', TRUE FROM assets a WHERE a.symbol = 'USDT'
ON CONFLICT (asset_id, provider) DO NOTHING;

INSERT INTO asset_price_mappings (asset_id, provider, provider_id, quote_currency, is_popular)
SELECT a.id, 'coingecko', 'usd-coin', 'USD', TRUE FROM assets a WHERE a.symbol = 'USDC'
ON CONFLICT (asset_id, provider) DO NOTHING;

