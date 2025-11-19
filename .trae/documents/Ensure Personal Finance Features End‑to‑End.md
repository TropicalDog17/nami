## Objectives
- Ensure backend calculations (cash flows, holdings aggregation, ROI/P&L) are correct.
- Expose accurate numbers in UI with clear currency handling and signs.
- Add quick crypto buy/sell entry. Enhance vault detail with live ROI/APR.

## Backend Verification Plan
- Transactions derived fields: audit `AmountLocal/USD/VND`, `DeltaQty`, and `CashFlow` behavior for all relevant types including crypto, borrow/repay, stake/unstake; confirm logic in backend/internal/models/transaction.go:130–177.
- Crypto price sourcing: verify daily/latest price fetch paths used by actions and vault enrich in backend/internal/services/action_service.go:336–413 and backend/internal/handlers/vault.go:124–206.
- Holdings: confirm combined holdings (base + open investments) and percentage computation in backend/internal/services/reporting_service.go:24–61; aggregation by asset/account in 98–140.
- P&L: validate `realized/total` and `roi_percent` fields in backend/internal/models/reporting.go:128–138 and handler wiring in backend/internal/handlers/reporting.go:209–242.
- Cash Flow: verify Operating vs Financing split and totals in backend/internal/models/reporting.go:41–74 and frontend displays.
- Vault math: check USD‑only stake/unstake handling and APR computation paths in backend/internal/handlers/vault.go:96–121, 208–307, 512–571, 573–632.

## UI Enhancements
1) Quick Crypto Trade Modals
- Create `QuickBuyModal` and `QuickSellModal` components.
- Call `actionsApi.perform('spot_buy', params)` for buy and a `sell` flow using raw transaction POST or an action variant if present; auto‑fetch price when `price_quote` omitted.
- Place entry points on Investments and Reports pages for fast access.

2) Vault Detail “Live Metrics”
- Add a toggle to fetch `GET /api/vaults/{id}?enrich=true` and show `roi_realtime_percent`, `apr_percent`, and benchmark ROI/APR.
- Add manual refresh control using `/api/vaults/{id}/refresh` to preview with custom unit price/value.

3) Reporting Display Consistency
- Ensure currency toggles render USD/VND consistently for holdings, investments, cash flow, spending, and P&L.
- Standardize sign formatting (`+`/`-`) and percentage precision.

## Tests & Validation
- Unit tests: transaction derived fields per type; vault APR computation; reporting service aggregation.
- Integration tests: action `spot_buy` end‑to‑end creating buy + quote asset usage; stake/unstake investment updates reflected in reports.
- UI checks: verify each tab displays correct numbers from the API with currency toggles.

## Rollout Steps
- Implement UI components and wiring.
- Run dev locally (`make run-dev`), seed a few transactions (expense, spot buy, stake/unstake), and validate all reports.
- Share a short demo and test evidence.

## Acceptance Criteria
- Backend endpoints return correct values for holdings, cash flow, spending, and P&L across test scenarios.
- UI shows matching numbers (USD/VND) with correct signs and percentages.
- Users can record crypto buy/sell and vault stake/withdraw easily, and see real‑time ROI/APR on vaults.

Confirm to proceed and I will implement these changes and verify them end‑to‑end.