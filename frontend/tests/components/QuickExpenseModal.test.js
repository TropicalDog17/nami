import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import QuickExpenseModal from '../../src/components/QuickExpenseModal';

describe('QuickExpenseModal', () => {
  const mockOnSubmit = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render modal with essential fields when open', () => {
    render(
      <QuickExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Quick Expense Entry')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Expense' })).toBeInTheDocument();
  });

  test('should pre-fill today\'s date and smart defaults', () => {
    const today = new Date().toISOString().split('T')[0];
    render(
      <QuickExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByDisplayValue(today)).toBeInTheDocument();
  });

  test('should call onSubmit with correct data when form is submitted', async () => {
    render(
      <QuickExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '25.50' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Coffee shop' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Expense' }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        date: expect.any(String),
        type: 'expense',
        amount: '25.50',
        note: 'Coffee shop',
        // ... other expected fields
      });
    });
  });
});