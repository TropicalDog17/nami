-- Migration: Add high_watermark column to vaults table
-- This column tracks the highest share price reached for performance fee calculations

ALTER TABLE vaults 
ADD COLUMN IF NOT EXISTS high_watermark DECIMAL(30,18) NOT NULL DEFAULT 0;

-- Set initial high_watermark to initial_share_price for existing vaults
UPDATE vaults 
SET high_watermark = initial_share_price 
WHERE high_watermark = 0 AND initial_share_price > 0;

