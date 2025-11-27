-- +migrate Up
ALTER TABLE vaults
ADD COLUMN IF NOT EXISTS manual_pricing_initial_aum DECIMAL(30,18) NOT NULL DEFAULT 0;

ALTER TABLE vaults
ADD COLUMN IF NOT EXISTS manual_pricing_reference_price DECIMAL(30,18) NOT NULL DEFAULT 0;


