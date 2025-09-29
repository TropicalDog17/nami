-- Widen precision for fx_rates.rate to avoid numeric overflow for high-value pairs
-- Previous: DECIMAL(12,8) allowed only 4 digits before decimal (max 9999.99999999)
-- New: DECIMAL(20,8) allows up to 12 digits before decimal

ALTER TABLE fx_rates
  ALTER COLUMN rate TYPE DECIMAL(20,8);


