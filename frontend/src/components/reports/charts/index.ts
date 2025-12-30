/**
 * Chart components index - Exports all chart components
 *
 * This file provides a single entry point for all chart components.
 * Individual charts can be gradually moved to separate files.
 */

// Export chart configuration
export * from './chartConfig';

// Export refactored individual charts
export { HoldingsChart } from './HoldingsChart';
export type { HoldingsData } from './HoldingsChart';

// Re-export all charts from the main Charts file for now
export {
  CashFlowChart,
  SpendingChart,
  PnLChart,
  PnLLineChart,
  AprChart,
  AprLineChart,
  TimeSeriesLineChart,
  DailySpendingChart,
  MonthlySpendingTrendChart,
  SpendingComparisonChart,
} from './Charts';
