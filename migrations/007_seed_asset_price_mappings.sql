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


