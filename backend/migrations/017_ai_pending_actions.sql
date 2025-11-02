-- AI Pending Actions storage for admin review workflow
BEGIN;

CREATE TABLE IF NOT EXISTS ai_pending_actions (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id VARCHAR(255),
    source VARCHAR(50) NOT NULL, -- telegram_text | telegram_image | future sources
    raw_input TEXT NOT NULL,
    toon_text TEXT,
    action_json JSONB,
    confidence NUMERIC(10,5),
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | accepted | rejected
    error TEXT,
    created_tx_ids TEXT[],
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_status ON ai_pending_actions(status);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_created_at ON ai_pending_actions(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_batch ON ai_pending_actions(batch_id);

COMMIT;


