-- Auto-link unstake/withdraw transactions to their corresponding deposits
-- This script finds best matches based on asset, account, quantity, and timing

WITH ranked_matches AS (
    SELECT
        w.id as withdraw_id,
        d.id as best_deposit_id,
        d.asset,
        w.account,
        w.quantity as withdraw_qty,
        d.quantity as deposit_qty,
        w.date as withdraw_date,
        d.date as deposit_date,
        -- Score the match: closer dates and quantities get higher scores
        (ABS(EXTRACT(EPOCH FROM (w.date - d.date)) / 86400) + -- days difference
         ABS(w.quantity - d.quantity) / NULLIF(d.quantity, 0)) as match_score
    FROM transactions w
    JOIN transactions d ON (
        d.asset = w.asset AND
        d.type IN ('deposit', 'stake', 'buy') AND
        d.date <= w.date AND
        d.deposit_id IS NULL -- Deposits not already linked
    )
    WHERE w.type IN ('withdraw', 'unstake', 'sell')
      AND w.deposit_id IS NULL -- Only process unlinked withdrawals
),
best_matches AS (
    SELECT
        withdraw_id,
        best_deposit_id,
        ROW_NUMBER() OVER (PARTITION BY withdraw_id ORDER BY match_score ASC) as rn
    FROM ranked_matches
)
UPDATE transactions w
SET deposit_id = bm.best_deposit_id,
    updated_at = CURRENT_TIMESTAMP
FROM best_matches bm
WHERE w.id = bm.withdraw_id
  AND bm.rn = 1; -- Only use the best match for each withdrawal

-- Show what was linked
SELECT
    w.id as withdraw_id,
    w.type,
    w.asset,
    w.quantity,
    w.amount_usd,
    w.date as withdraw_date,
    d.id as linked_deposit_id,
    d.quantity as deposit_quantity,
    d.amount_usd as deposit_amount_usd,
    d.date as deposit_date
FROM transactions w
JOIN transactions d ON w.deposit_id = d.id
WHERE w.type IN ('withdraw', 'unstake', 'sell')
  AND w.deposit_id IS NOT NULL
  AND w.updated_at = CURRENT_TIMESTAMP -- Only show newly linked ones
ORDER BY w.date DESC;