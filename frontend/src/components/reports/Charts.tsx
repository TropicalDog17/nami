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
import React from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

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

type Currency = 'USD' | 'VND';

type HoldingsData = {
  by_asset?: Record<
    string,
    { value_usd?: number | string; value_vnd?: number | string }
  >;
};

// Holdings Pie Chart
export const HoldingsChart: React.FC<{
  data: HoldingsData;
  currency?: Currency;
}> = ({ data, currency = 'USD' }) => {
  if (!data?.by_asset) return null;

  const assets = Object.entries(data.by_asset);
  const labels = assets.map(([asset]) => asset);
  const values = assets.map(([, holding]) =>
    Math.abs(
      parseFloat(
        String(
          currency === 'USD'
            ? (holding.value_usd ?? 0)
            : (holding.value_vnd ?? 0)
        )
      )
    )
  );

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#FF6384',
          '#C9CBCF',
        ],
        hoverBackgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#FF6384',
          '#C9CBCF',
        ],
      },
    ],
  };

  const options = {
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
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: {
            label?: string;
            parsed: number;
            dataset: { data: number[] };
          }) {
            const label = context.label ?? '';
            const value = context.parsed;
            const total = context.dataset.data.reduce(
              (a: number, b: number) => a + b,
              0
            );
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${value.toLocaleString()} ${currency} (${percentage}%)`;
          },
        },
      },
    },
  };

  return <Doughnut data={chartData} options={options} />;
};

type CashFlowByType = Record<
  string,
  {
    inflow_usd?: number | string;
    inflow_vnd?: number | string;
    outflow_usd?: number | string;
    outflow_vnd?: number | string;
  }
>;

// Cash Flow Bar Chart
export const CashFlowChart: React.FC<{
  data: { by_type?: CashFlowByType };
  currency?: Currency;
}> = ({ data, currency = 'USD' }) => {
  if (!data?.by_type) return null;

  const types = Object.entries(data.by_type);
  const labels = types.map(([type]) => type);
  const inflows = types.map(([, flow]) =>
    parseFloat(
      String(
        currency === 'USD' ? (flow.inflow_usd ?? 0) : (flow.inflow_vnd ?? 0)
      )
    )
  );
  const outflows = types.map(
    ([, flow]) =>
      -parseFloat(
        String(
          currency === 'USD' ? (flow.outflow_usd ?? 0) : (flow.outflow_vnd ?? 0)
        )
      )
  );

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Inflows',
        data: inflows,
        backgroundColor: '#4CAF50',
        borderColor: '#4CAF50',
        borderWidth: 1,
      },
      {
        label: 'Outflows',
        data: outflows,
        backgroundColor: '#F44336',
        borderColor: '#F44336',
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          padding: 8,
        },
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: {
            parsed: { y: number };
            dataset: { label?: string };
          }) {
            const value = Math.abs(context.parsed.y);
            return `${context.dataset.label ?? 'Value'}: ${value.toLocaleString()} ${currency}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          // @ts-ignore - chartjs types
          callback: function (value: number | string) {
            const n =
              typeof value === 'number' ? value : parseFloat(String(value));
            return Math.abs(n).toLocaleString();
          },
        },
      },
      x: {
        // @ts-ignore - chartjs types
        ticks: {
          fontSize: 10,
        },
      },
    },
  };

  return <Bar data={chartData} options={options} />;
};

type SpendingByTag = Record<
  string,
  {
    amount_usd?: number | string;
    amount_vnd?: number | string;
    percentage?: number | string;
  }
>;

// Spending Breakdown Chart
export const SpendingChart: React.FC<{
  data: { by_tag?: SpendingByTag };
  currency?: Currency;
}> = ({ data, currency = 'USD' }) => {
  if (!data?.by_tag) return null;

  const tags = Object.entries(data.by_tag)
    .sort(
      ([, a], [, b]) =>
        parseFloat(String(b.amount_usd ?? 0)) -
        parseFloat(String(a.amount_usd ?? 0))
    )
    .slice(0, 10); // Top 10 spending categories

  const labels = tags.map(([tag]) => tag);
  const amounts = tags.map(([, spending]) =>
    parseFloat(
      String(
        currency === 'USD'
          ? (spending.amount_usd ?? 0)
          : (spending.amount_vnd ?? 0)
      )
    )
  );

  const chartData = {
    labels,
    datasets: [
      {
        data: amounts,
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#FF6384',
          '#C9CBCF',
          '#4BC0C0',
          '#36A2EB',
        ],
      },
    ],
  };

  const options = {
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
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: {
            label?: string;
            parsed: number;
            dataIndex: number;
          }) {
            const label = context.label ?? '';
            const value = context.parsed;
            const percentage = parseFloat(
              String(tags[context.dataIndex][1].percentage ?? 0)
            ).toFixed(1);
            return `${label}: ${value.toLocaleString()} ${currency} (${percentage}%)`;
          },
        },
      },
    },
  };

  return <Doughnut data={chartData} options={options} />;
};

type PnLData = {
  realized_pnl_usd?: number | string;
  realized_pnl_vnd?: number | string;
  total_pnl_usd?: number | string;
  total_pnl_vnd?: number | string;
};

// P&L Chart (bar)
export const PnLChart: React.FC<{ data: PnLData; currency?: Currency }> = ({
  data,
  currency = 'USD',
}) => {
  if (!data) return null;

  const realizedPnL = parseFloat(
    String(
      currency === 'USD'
        ? (data.realized_pnl_usd ?? 0)
        : (data.realized_pnl_vnd ?? 0)
    )
  );
  const totalPnL = parseFloat(
    String(
      currency === 'USD' ? (data.total_pnl_usd ?? 0) : (data.total_pnl_vnd ?? 0)
    )
  );

  const chartData = {
    labels: ['Realized P&L', 'Total P&L'],
    datasets: [
      {
        label: `P&L (${currency})`,
        data: [realizedPnL, totalPnL],
        backgroundColor: [
          realizedPnL >= 0 ? '#4CAF50' : '#F44336',
          totalPnL >= 0 ? '#4CAF50' : '#F44336',
        ],
        borderColor: [
          realizedPnL >= 0 ? '#4CAF50' : '#F44336',
          totalPnL >= 0 ? '#4CAF50' : '#F44336',
        ],
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: { parsed: { y: number }; label?: string }) {
            const value = context.parsed.y;
            return `${context.label ?? 'Value'}: ${value.toLocaleString()} ${currency}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          // @ts-ignore - chartjs types
          callback: function (value: number | string) {
            const n =
              typeof value === 'number' ? value : parseFloat(String(value));
            return n.toLocaleString();
          },
        },
      },
      x: {
        ticks: {},
      },
    },
  };

  return <Bar data={chartData} options={options} />;
};

// P&L Line Chart
export const PnLLineChart: React.FC<{ data: PnLData; currency?: Currency }> = ({
  data,
  currency = 'USD',
}) => {
  if (!data) return null;

  const realizedPnL = parseFloat(
    String(
      currency === 'USD'
        ? (data.realized_pnl_usd ?? 0)
        : (data.realized_pnl_vnd ?? 0)
    )
  );
  const totalPnL = parseFloat(
    String(
      currency === 'USD' ? (data.total_pnl_usd ?? 0) : (data.total_pnl_vnd ?? 0)
    )
  );

  const chartData = {
    labels: ['Realized P&L', 'Total P&L'],
    datasets: [
      {
        label: `P&L (${currency})`,
        data: [realizedPnL, totalPnL],
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: function (context: { parsed: { y: number }; label?: string }) {
            const value = context.parsed.y;
            return `${context.label ?? 'Value'}: ${value.toLocaleString()} ${currency}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          // @ts-ignore - chartjs types
          callback: function (value: number | string) {
            const n =
              typeof value === 'number' ? value : parseFloat(String(value));
            return n.toLocaleString();
          },
        },
      },
    },
  };

  return <Line data={chartData} options={options} />;
};

// APR Comparison Chart (vault APR vs benchmark)
export const AprChart: React.FC<{ apr?: number; benchmarkApr?: number }> = ({
  apr = 0,
  benchmarkApr = 0,
}) => {
  const labels = ['Vault APR', 'Benchmark APR'];
  const dataset = [apr, benchmarkApr];
  const chartData = {
    labels,
    datasets: [
      {
        label: 'APR (%)',
        data: dataset,
        backgroundColor: ['#3B82F6', '#9CA3AF'],
        borderColor: ['#3B82F6', '#9CA3AF'],
        borderWidth: 1,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function (context: { parsed: { y: number }; label?: string }) {
            const value = context.parsed.y;
            return `${context.label ?? 'APR'}: ${Number(value).toFixed(2)}%`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          // @ts-ignore
          callback: function (value: number | string) {
            const n =
              typeof value === 'number' ? value : parseFloat(String(value));
            return `${Number(n).toFixed(2)}%`;
          },
        },
      },
    },
  };
  return <Bar data={chartData} options={options} />;
};

// APR as Line chart
export const AprLineChart: React.FC<{
  apr?: number;
  benchmarkApr?: number;
}> = ({ apr = 0, benchmarkApr = 0 }) => {
  const labels = ['Vault APR', 'Benchmark APR'];
  const dataset = [apr, benchmarkApr];
  const chartData = {
    labels,
    datasets: [
      {
        label: 'APR (%)',
        data: dataset,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        tension: 0.3,
        fill: true,
        pointRadius: 4,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function (context: { parsed: { y: number }; label?: string }) {
            const value = context.parsed.y;
            return `${context.label ?? 'APR'}: ${Number(value).toFixed(2)}%`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          // @ts-ignore
          callback: function (value: number | string) {
            const n =
              typeof value === 'number' ? value : parseFloat(String(value));
            return `${Number(n).toFixed(2)}%`;
          },
        },
      },
    },
  };
  return <Line data={chartData} options={options} />;
};

// Generic time-series line chart
export const TimeSeriesLineChart: React.FC<{
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
    fill?: boolean;
  }>;
  yFormat?: 'percent' | 'currency' | 'number';
  currency?: Currency;
}> = ({ labels, datasets, yFormat = 'number', currency = 'USD' }) => {
  // Helper to create gradient for a given color
  const createGradient = (
    ctx: CanvasRenderingContext2D,
    chartArea: { bottom: number; top: number },
    color: string
  ) => {
    const gradient = ctx.createLinearGradient(
      0,
      chartArea.top,
      0,
      chartArea.bottom
    );
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
    gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.1)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.02)`);
    return gradient;
  };

  // Format labels to "Month Day" format
  const formattedLabels = labels.map((label) => {
    const date = new Date(label);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const chartData = {
    labels: formattedLabels,
    datasets: datasets.map((ds) => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color || '#22c55e',
      backgroundColor: function (context: {
        chart: {
          canvas: HTMLCanvasElement;
          ctx: CanvasRenderingContext2D;
          chartArea?: {
            bottom: number;
            top: number;
            left: number;
            right: number;
          };
        };
      }) {
        const chart = context.chart;
        const { ctx, chartArea } = chart;
        if (!chartArea) {
          return ds.color ? `${ds.color}33` : '#22c55e33';
        }
        return createGradient(ctx, chartArea, ds.color || '#22c55e');
      },
      tension: 0.4,
      borderWidth: 2.5,
      fill: ds.fill ?? true,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: ds.color || '#22c55e',
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 2,
    })),
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          padding: 15,
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        callbacks: {
          title: function (context: { label: string }[]) {
            return context[0]?.label ?? '';
          },
          label: function (context: {
            parsed: { y: number };
            dataset: { label?: string };
          }) {
            const value = context.parsed.y;
            if (yFormat === 'percent')
              return `${context.dataset.label ?? ''}: ${Number(value).toFixed(2)}%`;
            if (yFormat === 'currency')
              return `${context.dataset.label ?? ''}: $${value.toLocaleString()}`;
            return `${context.dataset.label ?? ''}: ${value.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 6,
        },
      },
      y: {
        beginAtZero: false,
        ticks: {
          // @ts-ignore
          callback: function (value: number | string) {
            const n =
              typeof value === 'number' ? value : parseFloat(String(value));
            if (yFormat === 'percent') return `${Number(n).toFixed(2)}%`;
            if (yFormat === 'currency') return `$${n.toLocaleString()}`;
            return `${n.toLocaleString()}`;
          },
        },
      },
    },
  };
  return <Line data={chartData} options={options} />;
};

// Daily Spending Line Chart
type DailySpendingData = {
  by_day?: Record<
    string,
    { amount_usd?: number | string; amount_vnd?: number | string }
  >;
};
export const DailySpendingChart: React.FC<{
  data: DailySpendingData;
  currency?: Currency;
}> = ({ data, currency = 'USD' }) => {
  if (!data?.by_day) return null;

  const entries = Object.entries(data.by_day)
    .map(
      ([day, d]: [
        string,
        { amount_usd?: number | string; amount_vnd?: number | string },
      ]) => ({ day, ...d })
    )
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  const labels = entries.map((e) => e.day);
  const values = entries.map((e) =>
    Math.abs(
      parseFloat(
        String(currency === 'USD' ? (e.amount_usd ?? 0) : (e.amount_vnd ?? 0))
      )
    )
  );

  const chartData = {
    labels,
    datasets: [
      {
        label: `Daily Spending (${currency})`,
        data: values,
        borderColor: '#F97316',
        backgroundColor: 'rgba(249, 115, 22, 0.2)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      tooltip: {
        callbacks: {
          // @ts-ignore - chartjs types
          label: function (context: {
            parsed: { y: number };
            dataset: { label?: string };
          }) {
            const value = Math.abs(context.parsed.y);
            return `${context.dataset.label ?? ''}: ${value.toLocaleString()} ${currency}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          // @ts-ignore - chartjs types
          callback: function (value: number | string) {
            const n =
              typeof value === 'number' ? value : parseFloat(String(value));
            return Math.abs(n).toLocaleString();
          },
        },
      },
    },
  };

  return <Line data={chartData} options={options} />;
};

// Monthly Spending Trend Chart (Bar chart showing 12 months)
type MonthlyTrendData = {
  monthly_trend?: Array<{
    month: string;
    amount_usd: number;
    amount_vnd: number;
  }>;
};
export const MonthlySpendingTrendChart: React.FC<{
  data: MonthlyTrendData;
  currency?: Currency;
}> = ({ data, currency = 'USD' }) => {
  if (!data?.monthly_trend || data.monthly_trend.length === 0) return null;

  const labels = data.monthly_trend.map((m) => {
    const [year, month] = m.month.split('-');
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${monthNames[parseInt(month, 10) - 1]} ${year.slice(2)}`;
  });
  const values = data.monthly_trend.map((m) =>
    currency === 'USD' ? m.amount_usd : m.amount_vnd
  );

  // Calculate average for reference line
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  const chartData = {
    labels,
    datasets: [
      {
        label: `Monthly Spending (${currency})`,
        data: values,
        backgroundColor: values.map((v, i) =>
          i === values.length - 1 ? '#F97316' : 'rgba(249, 115, 22, 0.6)'
        ),
        borderColor: '#F97316',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function (context: { parsed: { y: number } }) {
            const value = context.parsed.y;
            const symbol = currency === 'USD' ? '$' : '₫';
            return `${symbol}${value.toLocaleString()}`;
          },
          afterLabel: function (context: { dataIndex: number }) {
            if (context.dataIndex > 0) {
              const current = values[context.dataIndex];
              const previous = values[context.dataIndex - 1];
              if (previous > 0) {
                const change = ((current - previous) / previous) * 100;
                return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs prev month`;
              }
            }
            return '';
          },
        },
      },
      annotation: {
        annotations: {
          averageLine: {
            type: 'line' as const,
            yMin: avg,
            yMax: avg,
            borderColor: '#9CA3AF',
            borderWidth: 2,
            borderDash: [5, 5],
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          // @ts-ignore - chartjs types
          callback: function (value: number | string) {
            const n =
              typeof value === 'number' ? value : parseFloat(String(value));
            const symbol = currency === 'USD' ? '$' : '₫';
            return `${symbol}${n.toLocaleString()}`;
          },
        },
      },
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 45,
        },
      },
    },
  };

  return <Bar data={chartData} options={options} />;
};

// Spending Comparison Chart (Current vs Last Month by category)
type SpendingComparisonData = {
  by_tag?: Record<
    string,
    { amount_usd: number; amount_vnd: number; count: number }
  >;
  current_month_by_tag?: Record<
    string,
    { amount_usd: number; amount_vnd: number }
  >;
  last_month_by_tag?: Record<
    string,
    { amount_usd: number; amount_vnd: number }
  >;
};
export const SpendingComparisonChart: React.FC<{
  currentMonthData: Record<string, number>;
  lastMonthData: Record<string, number>;
  currency?: Currency;
}> = ({ currentMonthData, lastMonthData, currency = 'USD' }) => {
  // Get all unique categories
  const allCategories = [
    ...new Set([
      ...Object.keys(currentMonthData),
      ...Object.keys(lastMonthData),
    ]),
  ]
    .sort((a, b) => (currentMonthData[b] || 0) - (currentMonthData[a] || 0))
    .slice(0, 8); // Top 8 categories

  if (allCategories.length === 0) return null;

  const chartData = {
    labels: allCategories,
    datasets: [
      {
        label: 'Current Month',
        data: allCategories.map((cat) => currentMonthData[cat] || 0),
        backgroundColor: '#F97316',
        borderColor: '#F97316',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Last Month',
        data: allCategories.map((cat) => lastMonthData[cat] || 0),
        backgroundColor: '#9CA3AF',
        borderColor: '#9CA3AF',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      tooltip: {
        callbacks: {
          // @ts-ignore - chartjs types
          label: function (context: {
            dataset: { label?: string };
            parsed: { y: number };
          }) {
            const symbol = currency === 'USD' ? '$' : '₫';
            return `${context.dataset.label ?? ''}: ${symbol}${context.parsed.y.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          // @ts-ignore - chartjs types
          callback: function (value: number | string) {
            const n =
              typeof value === 'number' ? value : parseFloat(String(value));
            const symbol = currency === 'USD' ? '$' : '₫';
            return `${symbol}${n.toLocaleString()}`;
          },
        },
      },
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 45,
        },
      },
    },
  };

  return <Bar data={chartData} options={options} />;
};

// Summary Stats Component
export const SummaryStats: React.FC<{
  title: string;
  stats: Array<{ label: string; value: number | string }>;
  currency?: Currency;
}> = ({ title, stats, currency = 'USD' }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
      <div className="grid grid-cols-1 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className="flex justify-between items-center">
            <span className="text-sm text-gray-500">{stat.label}</span>
            <span
              className={`text-sm font-medium ${
                Number(stat.value) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {typeof stat.value === 'number'
                ? `${stat.value.toLocaleString()} ${currency}`
                : stat.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
