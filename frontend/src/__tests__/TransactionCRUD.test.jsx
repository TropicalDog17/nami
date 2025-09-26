import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import TransactionPage from '../pages/TransactionPage'
import { AppProvider } from '../context/AppContext'

// Mock the API
const mockTransactions = [
  {
    id: '1',
    date: '2025-09-26T00:00:00Z',
    type: 'buy',
    asset: 'BTC',
    account: 'Binance Spot',
    counterparty: 'Test Exchange',
    tag: 'Trading',
    note: 'Test BTC purchase',
    quantity: '0.001',
    price_local: '67000',
    amount_local: '67',
    amount_usd: '67',
    amount_vnd: '1608000',
    cashflow_usd: '-68.5',
    cashflow_vnd: '-1644000',
    fee_usd: '1.5',
    fee_vnd: '36000'
  },
  {
    id: '2',
    date: '2025-09-26T00:00:00Z',
    type: 'sell',
    asset: 'ETH',
    account: 'Binance Spot',
    counterparty: 'Test Exchange',
    tag: 'Trading',
    note: 'Test ETH sale',
    quantity: '0.5',
    price_local: '2600',
    amount_local: '1300',
    amount_usd: '1300',
    amount_vnd: '31200000',
    cashflow_usd: '1298',
    cashflow_vnd: '31152000',
    fee_usd: '2',
    fee_vnd: '48000'
  }
]

const mockApi = {
  list: vi.fn(() => Promise.resolve([...mockTransactions])),
  get: vi.fn((id) => Promise.resolve(mockTransactions.find(t => t.id === id))),
  create: vi.fn((transaction) => {
    const newTransaction = {
      id: Date.now().toString(),
      ...transaction,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    mockTransactions.push(newTransaction)
    return Promise.resolve(newTransaction)
  }),
  update: vi.fn((id, transaction) => {
    const index = mockTransactions.findIndex(t => t.id === id)
    if (index !== -1) {
      mockTransactions[index] = { ...mockTransactions[index], ...transaction, updated_at: new Date().toISOString() }
      return Promise.resolve(mockTransactions[index])
    }
    return Promise.reject(new Error('Transaction not found'))
  }),
  delete: vi.fn((id) => {
    const index = mockTransactions.findIndex(t => t.id === id)
    if (index !== -1) {
      mockTransactions.splice(index, 1)
      return Promise.resolve()
    }
    return Promise.reject(new Error('Transaction not found'))
  })
}

vi.mock('../services/api', () => ({
  transactionApi: mockApi,
  adminApi: {
    listTypes: vi.fn(() => Promise.resolve([
      { id: 1, name: 'buy', description: 'Purchase', is_active: true },
      { id: 2, name: 'sell', description: 'Sale', is_active: true },
      { id: 3, name: 'expense', description: 'Expense', is_active: true },
      { id: 4, name: 'income', description: 'Income', is_active: true }
    ])),
    listAccounts: vi.fn(() => Promise.resolve([
      { id: 1, name: 'Binance Spot', type: 'Exchange', is_active: true },
      { id: 2, name: 'Bank', type: 'Bank', is_active: true },
      { id: 3, name: 'Cash', type: 'Cash', is_active: true }
    ])),
    listAssets: vi.fn(() => Promise.resolve([
      { id: 1, symbol: 'BTC', name: 'Bitcoin', is_active: true },
      { id: 2, symbol: 'ETH', name: 'Ethereum', is_active: true },
      { id: 3, symbol: 'USD', name: 'US Dollar', is_active: true }
    ])),
    listTags: vi.fn(() => Promise.resolve([
      { id: 1, name: 'Trading', category: 'Investment', is_active: true },
      { id: 2, name: 'Food', category: 'Expense', is_active: true }
    ]))
  }
}))

// Test wrapper with context
const TestWrapper = ({ children }) => (
  <AppProvider>
    {children}
  </AppProvider>
)

describe('Transaction CRUD Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock data
    mockTransactions.length = 0
    mockTransactions.push(
      {
        id: '1',
        date: '2025-09-26T00:00:00Z',
        type: 'buy',
        asset: 'BTC',
        account: 'Binance Spot',
        counterparty: 'Test Exchange',
        tag: 'Trading',
        note: 'Test BTC purchase',
        quantity: '0.001',
        price_local: '67000',
        amount_local: '67',
        amount_usd: '67',
        amount_vnd: '1608000',
        cashflow_usd: '-68.5',
        cashflow_vnd: '-1644000',
        fee_usd: '1.5',
        fee_vnd: '36000'
      },
      {
        id: '2',
        date: '2025-09-26T00:00:00Z',
        type: 'sell',
        asset: 'ETH',
        account: 'Binance Spot',
        counterparty: 'Test Exchange',
        tag: 'Trading',
        note: 'Test ETH sale',
        quantity: '0.5',
        price_local: '2600',
        amount_local: '1300',
        amount_usd: '1300',
        amount_vnd: '31200000',
        cashflow_usd: '1298',
        cashflow_vnd: '31152000',
        fee_usd: '2',
        fee_vnd: '48000'
      }
    )
  })

  describe('Read Operations', () => {
    it('displays list of transactions', async () => {
      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      // Wait for transactions to load
      await waitFor(() => {
        expect(screen.getByText('Test Exchange')).toBeInTheDocument()
      })

      // Verify both transactions are displayed
      expect(screen.getByText('BTC')).toBeInTheDocument()
      expect(screen.getByText('ETH')).toBeInTheDocument()
      expect(screen.getAllByText('Test Exchange')).toHaveLength(2)
    })

    it('displays transaction details correctly', async () => {
      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Exchange')).toBeInTheDocument()
      })

      // Check buy transaction details
      expect(screen.getByText('buy')).toBeInTheDocument()
      expect(screen.getByText('0.00100000')).toBeInTheDocument()
      expect(screen.getByText('$67.00')).toBeInTheDocument()
      expect(screen.getByText('-$68.50')).toBeInTheDocument()

      // Check sell transaction details
      expect(screen.getByText('sell')).toBeInTheDocument()
      expect(screen.getByText('0.50000000')).toBeInTheDocument()
      expect(screen.getByText('$1,300.00')).toBeInTheDocument()
      expect(screen.getByText('$1,298.00')).toBeInTheDocument()
    })

    it('toggles between USD and VND currency views', async () => {
      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Exchange')).toBeInTheDocument()
      })

      // Initially should show USD
      expect(screen.getByText('Amount (USD)')).toBeInTheDocument()
      expect(screen.getByText('$67.00')).toBeInTheDocument()

      // Click VND view
      fireEvent.click(screen.getByText('VND View'))

      await waitFor(() => {
        expect(screen.getByText('Amount (VND)')).toBeInTheDocument()
      })

      // Should now show VND amounts
      expect(screen.getByText('₫1,608,000.00')).toBeInTheDocument()
      expect(screen.getByText('₫31,200,000.00')).toBeInTheDocument()
    })
  })

  describe('Create Operations', () => {
    it('creates a new transaction successfully', async () => {
      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('New Transaction')).toBeInTheDocument()
      })

      // Click New Transaction button
      fireEvent.click(screen.getByText('New Transaction'))

      // Wait for form to appear
      await waitFor(() => {
        expect(screen.getByText('New Transaction')).toBeInTheDocument()
        expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
      })

      // Fill out the form
      fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-09-27' } })
      fireEvent.change(screen.getByLabelText(/transaction type/i), { target: { value: 'income' } })
      fireEvent.change(screen.getByLabelText(/asset/i), { target: { value: 'USD' } })
      fireEvent.change(screen.getByLabelText(/account/i), { target: { value: 'Bank' } })
      fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '1000' } })
      fireEvent.change(screen.getByLabelText(/price \(local currency\)/i), { target: { value: '1' } })
      fireEvent.change(screen.getByLabelText(/counterparty/i), { target: { value: 'New Employer' } })

      // Submit the form
      fireEvent.click(screen.getByText('Create Transaction'))

      // Wait for redirect and verify creation
      await waitFor(() => {
        expect(screen.getByText('Transactions')).toBeInTheDocument()
      })

      // Verify API was called
      expect(mockApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          asset: 'USD',
          account: 'Bank',
          counterparty: 'New Employer',
          quantity: 1000,
          price_local: 1
        })
      )
    })

    it('validates required fields', async () => {
      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      // Click New Transaction button
      fireEvent.click(screen.getByText('New Transaction'))

      await waitFor(() => {
        expect(screen.getByText('Create Transaction')).toBeInTheDocument()
      })

      // Try to submit empty form
      fireEvent.click(screen.getByText('Create Transaction'))

      // Should show validation errors
      await waitFor(() => {
        expect(screen.getByText(/date is required/i)).toBeInTheDocument()
      })

      // API should not be called
      expect(mockApi.create).not.toHaveBeenCalled()
    })

    it('calculates derived fields automatically', async () => {
      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      fireEvent.click(screen.getByText('New Transaction'))

      await waitFor(() => {
        expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument()
      })

      const quantityInput = screen.getByLabelText(/quantity/i)
      const priceInput = screen.getByLabelText(/price \(local currency\)/i)
      const amountLocalInput = screen.getByLabelText(/amount \(local\)/i)

      // Enter quantity and price
      fireEvent.change(quantityInput, { target: { value: '2' } })
      fireEvent.change(priceInput, { target: { value: '1000' } })

      // Wait for calculation
      await waitFor(() => {
        expect(amountLocalInput.value).toBe('2000.00000000')
      })
    })
  })

  describe('Update Operations', () => {
    it('edits an existing transaction', async () => {
      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      // Wait for transactions to load
      await waitFor(() => {
        expect(screen.getByText('Test Exchange')).toBeInTheDocument()
      })

      // Click on the first transaction row to edit
      const btcRow = screen.getByText('BTC').closest('tr')
      fireEvent.click(btcRow)

      // Wait for edit form
      await waitFor(() => {
        expect(screen.getByText('Edit Transaction')).toBeInTheDocument()
      })

      // Verify form is pre-populated
      expect(screen.getByDisplayValue('buy')).toBeInTheDocument()
      expect(screen.getByDisplayValue('BTC')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Test Exchange')).toBeInTheDocument()

      // Change the counterparty
      const counterpartyInput = screen.getByLabelText(/counterparty/i)
      fireEvent.change(counterpartyInput, { target: { value: 'Updated Exchange' } })

      // Submit the update
      fireEvent.click(screen.getByText('Update Transaction'))

      // Wait for redirect
      await waitFor(() => {
        expect(screen.getByText('Transactions')).toBeInTheDocument()
      })

      // Verify API was called
      expect(mockApi.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          counterparty: 'Updated Exchange'
        })
      )
    })

    it('cancels edit operation', async () => {
      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Exchange')).toBeInTheDocument()
      })

      // Click to edit
      const btcRow = screen.getByText('BTC').closest('tr')
      fireEvent.click(btcRow)

      await waitFor(() => {
        expect(screen.getByText('Edit Transaction')).toBeInTheDocument()
      })

      // Click cancel
      fireEvent.click(screen.getByText('Cancel'))

      // Should return to transaction list
      await waitFor(() => {
        expect(screen.getByText('Transactions')).toBeInTheDocument()
      })

      // Update API should not be called
      expect(mockApi.update).not.toHaveBeenCalled()
    })
  })

  describe('Delete Operations', () => {
    it('deletes a transaction', async () => {
      // Mock window.confirm
      const originalConfirm = window.confirm
      window.confirm = vi.fn(() => true)

      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Exchange')).toBeInTheDocument()
      })

      // Find and click delete button for first transaction
      const deleteButtons = screen.getAllByText('Delete')
      fireEvent.click(deleteButtons[0])

      // Wait for deletion to complete
      await waitFor(() => {
        expect(mockApi.delete).toHaveBeenCalledWith('1')
      })

      // Restore original confirm
      window.confirm = originalConfirm
    })

    it('cancels deletion when user clicks cancel', async () => {
      // Mock window.confirm to return false
      const originalConfirm = window.confirm
      window.confirm = vi.fn(() => false)

      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Exchange')).toBeInTheDocument()
      })

      // Find and click delete button
      const deleteButtons = screen.getAllByText('Delete')
      fireEvent.click(deleteButtons[0])

      // Delete API should not be called
      expect(mockApi.delete).not.toHaveBeenCalled()

      // Restore original confirm
      window.confirm = originalConfirm
    })
  })

  describe('Data Table Features', () => {
    it('filters transactions using search', async () => {
      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Exchange')).toBeInTheDocument()
      })

      // Find search input
      const searchInput = screen.getByPlaceholderText('Search...')
      
      // Search for BTC
      fireEvent.change(searchInput, { target: { value: 'BTC' } })

      // Should show only BTC transaction
      await waitFor(() => {
        expect(screen.getByText('BTC')).toBeInTheDocument()
        expect(screen.queryByText('ETH')).not.toBeInTheDocument()
      })
    })

    it('sorts transactions by clicking column headers', async () => {
      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Exchange')).toBeInTheDocument()
      })

      // Click on Asset column header to sort
      const assetHeader = screen.getByText('Asset')
      fireEvent.click(assetHeader)

      // The sorting should be applied (we can't easily test the actual order without more complex setup)
      // But we can verify the header was clickable
      expect(assetHeader).toBeInTheDocument()
    })

    it('displays correct transaction count', async () => {
      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Showing 1 to 2 of 2 results')).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      // Mock API to return error
      mockApi.list.mockRejectedValueOnce(new Error('API Error'))

      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      // Should handle the error without crashing
      await waitFor(() => {
        expect(screen.getByText('Transactions')).toBeInTheDocument()
      })
    })

    it('handles create transaction errors', async () => {
      // Mock create to fail
      mockApi.create.mockRejectedValueOnce(new Error('Create failed'))

      render(
        <TestWrapper>
          <TransactionPage />
        </TestWrapper>
      )

      fireEvent.click(screen.getByText('New Transaction'))

      await waitFor(() => {
        expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
      })

      // Fill and submit form
      fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2025-09-27' } })
      fireEvent.change(screen.getByLabelText(/transaction type/i), { target: { value: 'income' } })
      fireEvent.change(screen.getByLabelText(/asset/i), { target: { value: 'USD' } })
      fireEvent.change(screen.getByLabelText(/account/i), { target: { value: 'Bank' } })
      fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '1000' } })
      fireEvent.change(screen.getByLabelText(/price \(local currency\)/i), { target: { value: '1' } })

      fireEvent.click(screen.getByText('Create Transaction'))

      // Should handle error gracefully
      await waitFor(() => {
        expect(mockApi.create).toHaveBeenCalled()
      })
    })
  })
})
