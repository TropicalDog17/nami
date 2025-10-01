-- Add flexible price provider configuration to asset_price_mappings
-- This allows admins to configure custom API endpoints and parameters

ALTER TABLE asset_price_mappings
    ADD COLUMN IF NOT EXISTS api_endpoint TEXT,
    ADD COLUMN IF NOT EXISTS api_config JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS response_path TEXT,
    ADD COLUMN IF NOT EXISTS auto_populate BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS populate_from_date DATE,
    ADD COLUMN IF NOT EXISTS last_populated_date DATE,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add comments for documentation
COMMENT ON COLUMN asset_price_mappings.api_endpoint IS 'Custom API endpoint template. Use {symbol}, {date}, {currency} placeholders';
COMMENT ON COLUMN asset_price_mappings.api_config IS 'JSON config: {headers: {}, query_params: {}, auth_type: "bearer|apikey|none", auth_value: ""}';
COMMENT ON COLUMN asset_price_mappings.response_path IS 'JSON path to extract price from response, e.g., "data.price" or "rates.XAU"';
COMMENT ON COLUMN asset_price_mappings.auto_populate IS 'Whether to automatically populate historical prices on creation';
COMMENT ON COLUMN asset_price_mappings.populate_from_date IS 'Start date for historical price population';
COMMENT ON COLUMN asset_price_mappings.last_populated_date IS 'Last date that was successfully populated';

-- Create index for active mappings
CREATE INDEX IF NOT EXISTS idx_asset_price_mappings_active ON asset_price_mappings(is_active) WHERE is_active = TRUE;

-- Create a table to track price population jobs
CREATE TABLE IF NOT EXISTS price_population_jobs (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    mapping_id INTEGER NOT NULL REFERENCES asset_price_mappings(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    current_progress_date DATE,
    total_days INTEGER,
    completed_days INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_population_jobs_status ON price_population_jobs(status);
CREATE INDEX IF NOT EXISTS idx_price_population_jobs_asset ON price_population_jobs(asset_id);

-- Example configurations for common providers
-- These are just examples, actual API keys should be set via environment variables

-- CoinGecko example (already handled by existing provider)
-- INSERT INTO asset_price_mappings (asset_id, provider, provider_id, quote_currency, is_popular, api_endpoint, response_path, auto_populate, populate_from_date)
-- SELECT id, 'coingecko', 'bitcoin', 'USD', TRUE,
--        'https://api.coingecko.com/api/v3/coins/{provider_id}/history?date={date_ddmmyyyy}',
--        'market_data.current_price.{currency_lower}',
--        TRUE,
--        '2020-01-01'
-- FROM assets WHERE symbol = 'BTC';

-- Custom API example (generic REST API)
-- INSERT INTO asset_price_mappings (asset_id, provider, provider_id, quote_currency, is_popular, api_endpoint, api_config, response_path, auto_populate, populate_from_date)
-- SELECT id, 'custom', 'CUSTOM_SYMBOL', 'USD', FALSE,
--        'https://api.example.com/v1/prices',
--        '{"headers": {"X-API-Key": "${CUSTOM_API_KEY}"}, "query_params": {"symbol": "{symbol}", "date": "{date}", "currency": "{currency}"}}'::jsonb,
--        'data.price',
--        TRUE,
--        '2023-01-01'
-- FROM assets WHERE symbol = 'CUSTOM';

