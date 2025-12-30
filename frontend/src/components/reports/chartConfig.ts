/**
 * Shared Chart.js configuration and registration for all chart components.
 * Centralizes chart setup to avoid duplication across multiple chart files.
 */

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';

// Register Chart.js components globally
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

/**
 * Common chart colors palette
 */
export const CHART_COLORS = {
  background: [
    '#FF6384',
    '#36A2EB',
    '#FFCE56',
    '#4BC0C0',
    '#9966FF',
    '#FF9F40',
    '#FF6384',
    '#C9CBCF',
  ],
  hover: [
    '#FF6384',
    '#36A2EB',
    '#FFCE56',
    '#4BC0C0',
    '#9966FF',
    '#FF9F40',
    '#FF6384',
    '#C9CBCF',
  ],
} as const;

/**
 * Common chart options that can be reused
 */
export const COMMON_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        boxWidth: 12,
        padding: 10,
      },
    },
  },
} as const;

/**
 * Type for currency selection
 */
export type Currency = 'USD' | 'VND';

/**
 * Re-exports for convenience
 */
export { ChartJS };
