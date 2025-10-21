import { render, screen } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import CreditDashboardPage from '../../src/pages/CreditDashboardPage';

const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('CreditDashboardPage', () => {
  test('should render credit dashboard title', () => {
    renderWithRouter(<CreditDashboardPage />);

    expect(screen.getByText('Credit Card Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Outstanding Balances')).toBeInTheDocument();
    expect(screen.getByText('Recent Credit Transactions')).toBeInTheDocument();
  });
});