import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import TransactionForm from '../components/TransactionForm'
import { AppProvider } from '../context/AppContext'

// Mock the API
vi.mock('../services/api', () => ({
  adminApi: {
    listTypes: vi.fn(() => Promise.resolve([
      { id: 1, name: 'buy', description: 'Purchase', is_active: true },
      { id: 2, name: 'sell', description: 'Sale', is_active: true }
    ])),
    listAccounts: vi.fn(() => Promise.resolve([
      { id: 1, name: 'Bank', type: 'Bank', is_active: true },
      { id: 2, name: 'Cash', type: 'Cash', is_active: true }
    ])),
    listAssets: vi.fn(() => Promise.resolve([
      { id: 1, symbol: 'USD', name: 'US Dollar', is_active: true },
      { id: 2, symbol: 'BTC', name: 'Bitcoin', is_active: true }
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

describe('TransactionForm', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form fields correctly', async () => {
    render(
      <TestWrapper>
        <TransactionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
      </TestWrapper>
    )

    // Wait for master data to load
    await waitFor(() => {
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
    })

    // Check required fields are present
    expect(screen.getByLabelText(/transaction type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/asset/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/account/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/price \(local currency\)/i)).toBeInTheDocument()
  })

  it('calculates derived fields automatically', async () => {
    render(
      <TestWrapper>
        <TransactionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument()
    })

    const quantityInput = screen.getByLabelText(/quantity/i)
    const priceInput = screen.getByLabelText(/price \(local currency\)/i)
    const amountLocalInput = screen.getByLabelText(/amount \(local\)/i)

    // Enter quantity and price
    fireEvent.change(quantityInput, { target: { value: '0.1' } })
    fireEvent.change(priceInput, { target: { value: '50000' } })

    // Wait for calculation
    await waitFor(() => {
      expect(amountLocalInput.value).toBe('5000.00000000')
    })
  })

  it('validates required fields', async () => {
    render(
      <TestWrapper>
        <TransactionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create transaction/i })).toBeInTheDocument()
    })

    const submitButton = screen.getByRole('button', { name: /create transaction/i })
    
    // Try to submit empty form
    fireEvent.click(submitButton)

    // Should show validation errors
    await waitFor(() => {
      expect(screen.getByText(/date is required/i)).toBeInTheDocument()
    })

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('submits form with valid data', async () => {
    render(
      <TestWrapper>
        <TransactionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
    })

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/date/i), { 
      target: { value: '2025-09-26' } 
    })
    
    fireEvent.change(screen.getByLabelText(/transaction type/i), { 
      target: { value: 'buy' } 
    })
    
    fireEvent.change(screen.getByLabelText(/asset/i), { 
      target: { value: 'BTC' } 
    })
    
    fireEvent.change(screen.getByLabelText(/account/i), { 
      target: { value: 'Bank' } 
    })
    
    fireEvent.change(screen.getByLabelText(/quantity/i), { 
      target: { value: '0.1' } 
    })
    
    fireEvent.change(screen.getByLabelText(/price \(local currency\)/i), { 
      target: { value: '50000' } 
    })

    // Submit form
    const submitButton = screen.getByRole('button', { name: /create transaction/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'buy',
          asset: 'BTC',
          account: 'Bank',
          quantity: 0.1,
          price_local: 50000
        })
      )
    })
  })

  it('calls onCancel when cancel button is clicked', async () => {
    render(
      <TestWrapper>
        <TransactionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    expect(mockOnCancel).toHaveBeenCalled()
  })

  it('loads transaction data for editing', async () => {
    const existingTransaction = {
      id: '123',
      date: '2025-09-26T00:00:00Z',
      type: 'sell',
      asset: 'USD',
      account: 'Cash',
      quantity: '100',
      price_local: '1',
      fx_to_usd: '1.0',
      fx_to_vnd: '24000.0'
    }

    render(
      <TestWrapper>
        <TransactionForm 
          transaction={existingTransaction}
          onSubmit={mockOnSubmit} 
          onCancel={mockOnCancel} 
        />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('sell')).toBeInTheDocument()
    })

    expect(screen.getByDisplayValue('USD')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Cash')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })
})
