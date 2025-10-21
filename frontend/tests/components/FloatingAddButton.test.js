import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import FloatingAddButton from '../../src/components/FloatingAddButton';

describe('FloatingAddButton', () => {
  const mockOnClick = jest.fn();

  test('should render floating button', () => {
    render(<FloatingAddButton onClick={mockOnClick} />);

    const button = screen.getByRole('button', { name: /add/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('fixed', 'bottom-8', 'right-8');
  });

  test('should call onClick when clicked', () => {
    render(<FloatingAddButton onClick={mockOnClick} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });
});