# PnL Calculation and Asset Allocation System Design

## Date: 2025-10-25

### Overview
Design document for improving PnL calculation and asset allocation system by removing broken logic and implementing clean, investment-table-based tracking.

## Problems Identified

### 1. PnL Calculation Issues
- **Current**: Only calculates PnL from linked stake-unstake pairs via `transaction_links`
- **Missing**: Sell transaction PnL, partial close logic, proper cost basis tracking
- **Symptom**: Very small PnL values (0.0045) instead of realistic numbers

### 2. Asset Allocation Issues
- **Current**: Holdings query may miss assets with zero quantities
- **Missing**: Proper percentage calculations, hierarchical grouping
- **Symptom**: Inconsistent allocation percentages between views

### 3. Test Failures
- Backend tests failing due to incorrect PnL expectations
- Frontend tests failing due to backend connectivity issues
- Missing comprehensive E2E test coverage

## Solution Architecture

### Core Principle
Use the existing `investments` table as the single source of truth, removing complex transaction linking logic in favor of simple, direct calculations.

### Backend Changes

#### 1. Simplified PnL Calculation (`reporting_repository.go`)

**Remove**: Complex stake-unstake pairing logic using `transaction_links`

**Replace**: Simple investment-table-based queries:

```sql
-- Simple, direct PnL calculation
SELECT
    COALESCE(SUM(i.pnl), 0) as realized_pnl_usd,
    COALESCE(SUM(i.deposit_cost), 0) as total_cost_basis
FROM investments i
WHERE i.withdrawal_date >= $1 AND i.withdrawal_date <= $2
AND i.is_open = false
```

#### 2. Enhanced Asset Allocation (`reporting_repository.go`)

**Fix**: Include all assets, improve percentage calculations

```sql
-- Enhanced holdings with proper percentage handling
WITH latest_positions AS (
    SELECT
        asset, account, SUM(delta_qty) as total_quantity,
        MAX(date) as last_transaction_date
    FROM transactions
    WHERE date <= $1
    GROUP BY asset, account
),
asset_totals AS (
    SELECT
        asset, SUM(total_quantity) as total_quantity
    FROM latest_positions
    WHERE total_quantity != 0
    GROUP BY asset
)
SELECT * FROM asset_totals ORDER BY total_quantity DESC
```

#### 3. New Investment Service Features

**Add**: Real-time PnL updates, position tracking

**Remove**: Complex transaction linking logic

### Frontend Changes

#### 1. Enhanced Asset Allocation Chart

**Fix**: Proper data handling, zero-value assets

**Add**: Hierarchical display, drill-down capabilities

#### 2. New PnL Dashboard Component

**Add**: Real-time PnL display, historical tracking

**Improve**: Data visualization, export functionality

### API Changes

#### New Endpoints
- `GET /api/reports/pnl/simple` - Clean PnL calculation
- `GET /api/reports/holdings/enhanced` - Improved asset allocation

#### Enhanced Existing Endpoints
- Add proper error handling
- Improve response formats
- Add caching headers

### Testing Strategy

#### 1. Backend Unit Tests
- Test simplified PnL logic
- Test edge cases (empty data, zero values)
- Test percentage calculations

#### 2. Integration Tests
- Test complete PnL workflow
- Test asset allocation consistency
- Test API responses

#### 3. Frontend E2E Tests (Playwright)
- Test PnL dashboard functionality
- Test asset allocation chart accuracy
- Test user interactions
- Test responsive design

### Implementation Steps

1. **Backend Refactoring**
   - Remove complex PnL logic
   - Implement investment-table-based calculations
   - Fix asset allocation queries
   - Add comprehensive unit tests

2. **Frontend Updates**
   - Update components for new data formats
   - Add new PnL dashboard
   - Improve error handling
   - Add E2E tests

3. **Integration Testing**
   - End-to-end workflow testing
   - Performance validation
   - User acceptance testing

### Success Criteria

1. **Accurate PnL Calculations**
   - Realistic PnL values for test data
   - Proper handling of all transaction types
   - Correct cost basis tracking

2. **Reliable Asset Allocation**
   - Accurate percentage calculations
   - Consistent data across all views
   - Proper handling of edge cases

3. **Comprehensive Test Coverage**
   - All backend tests passing
   - Frontend E2E tests passing
   - No skipped or disabled tests

4. **Performance**
   - Fast query response times
   - Efficient frontend rendering
   - Good user experience

## Next Steps

1. Create isolated development environment
2. Implement backend changes
3. Update frontend components
4. Write comprehensive tests
5. Validate all functionality
6. Deploy to production