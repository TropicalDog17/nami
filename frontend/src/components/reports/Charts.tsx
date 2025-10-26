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

// Holdings Pie Chart
export const HoldingsChart = ({ data, currency = 'USD' }) => {
  if (!data?.by_asset) return null

  const assets = Object.entries(data.by_asset)
  const labels = assets.map(([asset]) => asset)
  const values = assets.map(([, holding]) =>
    Math.abs(parseFloat(currency === 'USD' ? holding.value_usd : holding.value_vnd))
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
          label: function (context) {
            const label = context.label || ''
            const value = context.parsed
            const total = context.dataset.data.reduce((a, b) => a + b, 0)
            const percentage = ((value / total) * 100).toFixed(1)
            return `${label}: ${value.toLocaleString()} ${currency} (${percentage}%)`
          }
        }
      }
    },
  }

  return <Doughnut data={chartData} options={options} />
}

// Cash Flow Bar Chart
export const CashFlowChart = ({ data, currency = 'USD' }) => {
  if (!data?.by_type) return null

  const types = Object.entries(data.by_type)
  const labels = types.map(([type]) => type)
  const inflows = types.map(([, flow]) =>
    parseFloat(currency === 'USD' ? flow.inflow_usd : flow.inflow_vnd)
  )
  const outflows = types.map(([, flow]) =>
    -parseFloat(currency === 'USD' ? flow.outflow_usd : flow.outflow_vnd)
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
          label: function (context) {
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
          fontSize: 10,
          callback: function (value) {
            return Math.abs(value).toLocaleString()
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

// Spending Breakdown Chart
export const SpendingChart = ({ data, currency = 'USD' }) => {
  if (!data?.by_tag) return null

  const tags = Object.entries(data.by_tag)
    .sort(([, a], [, b]) => parseFloat(b.amount_usd) - parseFloat(a.amount_usd))
    .slice(0, 10) // Top 10 spending categories

  const labels = tags.map(([tag]) => tag)
  const amounts = tags.map(([, spending]) =>
    parseFloat(currency === 'USD' ? spending.amount_usd : spending.amount_vnd)
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
          label: function (context) {
            const label = context.label || ''
            const value = context.parsed
            const percentage = parseFloat(tags[context.dataIndex][1].percentage).toFixed(1)
            return `${label}: ${value.toLocaleString()} ${currency} (${percentage}%)`
          }
        }
      }
    },
  }

  return <Doughnut data={chartData} options={options} />
}

// P&L Chart (simple for now)
export const PnLChart = ({ data, currency = 'USD' }) => {
  if (!data) return null

  const realizedPnL = parseFloat(currency === 'USD' ? data.realized_pnl_usd : data.realized_pnl_vnd)
  const totalPnL = parseFloat(currency === 'USD' ? data.total_pnl_usd : data.total_pnl_vnd)

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
          label: function (context) {
            const value = context.parsed.y
            return `${context.label}: ${value.toLocaleString()} ${currency}`
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value) {
            return (value as number).toLocaleString()
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

// Daily Spending Line Chart
export const DailySpendingChart = ({ data, currency = 'USD' }) => {
  if (!data?.by_day) return null

  const entries = Object.entries(data.by_day)
    .map(([day, d]: [string, any]) => ({ day, ...(d) }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))

  const labels = entries.map((e) => e.day)
  const values = entries.map((e) =>
    Math.abs(parseFloat(currency === 'USD' ? e.amount_usd : e.amount_vnd))
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
          label: function (context) {
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
          callback: function (value: any) {
            return Math.abs(value).toLocaleString()
          }
        }
      }
    }
  }

  return <Line data={chartData} options={options} />
}

// Summary Stats Component
export const SummaryStats = ({ title, stats, currency = 'USD' }) => {
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
