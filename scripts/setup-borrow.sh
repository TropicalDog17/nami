#!/usr/bin/env bash
set -euo pipefail

# Creates/sets up spending vaults:
# - CASH_VAULT: default cash spending vault (used for income/expense)
# - CREDIT_VAULT: credit/borrowings vault (used for credit/loans)
#
# Override via env:
#   BASE_URL=http://localhost:8080/api CASH_VAULT=Spend CREDIT_VAULT=Borrowings ./setup_spending_vaults.sh

BASE_URL="${BASE_URL:-http://localhost:8080/api}"
CASH_VAULT="${CASH_VAULT:-Spend}"
CREDIT_VAULT="${CREDIT_VAULT:-Borrowings}"

has_jq=1
command -v jq >/dev/null 2>&1 || has_jq=0

echo "Setting default cash spending vault to '${CASH_VAULT}'..."
resp=$(curl -sS -X POST "${BASE_URL}/admin/settings/spending-vault" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${CASH_VAULT}\"}")
if [ $has_jq -eq 1 ]; then echo "$resp" | jq -r '.'; else echo "$resp"; fi

echo "Ensuring cash vault '${CASH_VAULT}' exists (idempotent)..."
resp=$(curl -sS -X POST "${BASE_URL}/vaults" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${CASH_VAULT}\"}")
if [ $has_jq -eq 1 ]; then echo "$resp" | jq -r '.'; else echo "$resp"; fi

echo "Ensuring credit vault '${CREDIT_VAULT}' exists (idempotent)..."
resp=$(curl -sS -X POST "${BASE_URL}/vaults" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${CREDIT_VAULT}\"}")
if [ $has_jq -eq 1 ]; then echo "$resp" | jq -r '.'; else echo "$resp"; fi

echo "Verifying settings..."
resp=$(curl -sS "${BASE_URL}/admin/settings")
if [ $has_jq -eq 1 ]; then echo "$resp" | jq -r '.'; else echo "$resp"; fi

echo "Listing vaults..."
resp=$(curl -sS "${BASE_URL}/vaults?enrich=true")
if [ $has_jq -eq 1 ]; then echo "$resp" | jq -r '.'; else echo "$resp"; fi

echo "Done."