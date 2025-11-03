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
} from 'chart.js'
import React from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'

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
)

type Currency = 'USD' | 'VND'

type HoldingsData = {
  by_asset?: Record<string, { value_usd?: number | string; value_vnd?: number | string }>
}

// Holdings Pie Chart
export const HoldingsChart: React.FC<{ data: HoldingsData; currency?: Currency }> = ({ data, currency = 'USD' }) => {
  if (!data?.by_asset) return null

  const assets = Object.entries(data.by_asset)
  const labels = assets.map(([asset]) => asset)
  const values = assets.map(([, holding]) =>
    Math.abs(parseFloat(String(currency === 'USD' ? (holding.value_usd ?? 0) : (holding.value_vnd ?? 0))))
  )

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
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 10,
        }
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: { label?: string; parsed: number; dataset: { data: number[] } }) {
            const label = context.label ?? ''
            const value = context.parsed
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0)
            const percentage = ((value / total) * 100).toFixed(1)
            return `${label}: ${value.toLocaleString()} ${currency} (${percentage}%)`
          }
        }
      }
    },
  }

  return <Doughnut data={chartData} options={options} />
}

type CashFlowByType = Record<string, { inflow_usd?: number | string; inflow_vnd?: number | string; outflow_usd?: number | string; outflow_vnd?: number | string }>

// Cash Flow Bar Chart
export const CashFlowChart: React.FC<{ data: { by_type?: CashFlowByType }; currency?: Currency }> = ({ data, currency = 'USD' }) => {
  if (!data?.by_type) return null

  const types = Object.entries(data.by_type)
  const labels = types.map(([type]) => type)
  const inflows = types.map(([, flow]) =>
    parseFloat(String(currency === 'USD' ? (flow.inflow_usd ?? 0) : (flow.inflow_vnd ?? 0)))
  )
  const outflows = types.map(([, flow]) =>
    -parseFloat(String(currency === 'USD' ? (flow.outflow_usd ?? 0) : (flow.outflow_vnd ?? 0)))
  )

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
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          boxWidth: 12,
          padding: 8,
        }
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: { parsed: { y: number }; dataset: { label?: string } }) {
            const value = Math.abs(context.parsed.y)
            return `${context.dataset.label ?? 'Value'}: ${value.toLocaleString()} ${currency}`
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          fontSize: 10,
          callback: function (value: number | string) {
            const n = typeof value === 'number' ? value : parseFloat(String(value))
            return Math.abs(n).toLocaleString()
          }
        }
      },
      x: {
        ticks: {
          fontSize: 10
        }
      }
    },
  }

  return <Bar data={chartData} options={options} />
}

type SpendingByTag = Record<string, { amount_usd?: number | string; amount_vnd?: number | string; percentage?: number | string }>

// Spending Breakdown Chart
export const SpendingChart: React.FC<{ data: { by_tag?: SpendingByTag }; currency?: Currency }> = ({ data, currency = 'USD' }) => {
  if (!data?.by_tag) return null

  const tags = Object.entries(data.by_tag)
    .sort(([, a], [, b]) => parseFloat(String((b.amount_usd ?? 0))) - parseFloat(String((a.amount_usd ?? 0))))
    .slice(0, 10) // Top 10 spending categories

  const labels = tags.map(([tag]) => tag)
  const amounts = tags.map(([, spending]) =>
    parseFloat(String(currency === 'USD' ? (spending.amount_usd ?? 0) : (spending.amount_vnd ?? 0)))
  )

  const chartData = {
    labels,
    datasets: [
      {
        data: amounts,
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
          '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#36A2EB'
        ],
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 10,
        }
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: { label?: string; parsed: number; dataIndex: number }) {
            const label = context.label ?? ''
            const value = context.parsed
            const percentage = parseFloat(String(tags[context.dataIndex][1].percentage ?? 0)).toFixed(1)
            return `${label}: ${value.toLocaleString()} ${currency} (${percentage}%)`
          }
        }
      }
    },
  }

  return <Doughnut data={chartData} options={options} />
}

type PnLData = { realized_pnl_usd?: number | string; realized_pnl_vnd?: number | string; total_pnl_usd?: number | string; total_pnl_vnd?: number | string }

// P&L Chart (simple for now)
export const PnLChart: React.FC<{ data: PnLData; currency?: Currency }> = ({ data, currency = 'USD' }) => {
  if (!data) return null

  const realizedPnL = parseFloat(String(currency === 'USD' ? (data.realized_pnl_usd ?? 0) : (data.realized_pnl_vnd ?? 0)))
  const totalPnL = parseFloat(String(currency === 'USD' ? (data.total_pnl_usd ?? 0) : (data.total_pnl_vnd ?? 0)))

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
  }

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
            const value = context.parsed.y
            return `${context.label ?? 'Value'}: ${value.toLocaleString()} ${currency}`
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value: number | string) {
            const n = typeof value === 'number' ? value : parseFloat(String(value))
            return n.toLocaleString()
          }
        }
      },
      x: {
        ticks: {}
      }
    },
  }

  return <Bar data={chartData} options={options} />
}

type DailySpendingData = { by_day?: Record<string, { amount_usd?: number | string; amount_vnd?: number | string }> }

// Daily Spending Line Chart
export const DailySpendingChart: React.FC<{ data: DailySpendingData; currency?: Currency }> = ({ data, currency = 'USD' }) => {
  if (!data?.by_day) return null

  const entries = Object.entries(data.by_day)
    .map(([day, d]: [string, { amount_usd?: number | string; amount_vnd?: number | string }]) => ({ day, ...(d) }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))

  const labels = entries.map((e) => e.day)
  const values = entries.map((e) =>
    Math.abs(parseFloat(String(currency === 'USD' ? (e.amount_usd ?? 0) : (e.amount_vnd ?? 0))))
  )

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
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: function (context: { parsed: { y: number }; dataset: { label: string } }) {
            const value = Math.abs(context.parsed.y)
            return `${context.dataset.label}: ${value.toLocaleString()} ${currency}`
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value: number | string) {
            const n = typeof value === 'number' ? value : parseFloat(String(value))
            return Math.abs(n).toLocaleString()
          }
        }
      }
    }
  }

  return <Line data={chartData} options={options} />
}

// Summary Stats Component
export const SummaryStats: React.FC<{ title: string; stats: Array<{ label: string; value: number | string }>; currency?: Currency }> = ({ title, stats, currency = 'USD' }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
      <div className="grid grid-cols-1 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className="flex justify-between items-center">
            <span className="text-sm text-gray-500">{stat.label}</span>
            <span className={`text-sm font-medium ${stat.value >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
              {typeof stat.value === 'number'
                ? `${stat.value.toLocaleString()} ${currency}`
                : stat.value
              }
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
