import { render, screen } from '@testing-library/react';
import React from 'react';
import AssetAllocationChart from '../../../src/components/reports/AssetAllocationChart';

describe('AssetAllocationChart', () => {
  const mockData = {
    by_asset: {
      'USD': { quantity: 1000, value_usd: 1000, percentage: 50 },
      'BTC': { quantity: 0.01, value_usd: 500, percentage: 25 },
      'ETH': { quantity: 1, value_usd: 500, percentage: 25 }
    }
  };

  test('should render asset allocation chart', () => {
    render(<AssetAllocationChart data={mockData} currency="USD" />);

    expect(screen.getByText('Asset Allocation')).toBeInTheDocument();
    expect(screen.getByText('Total Portfolio Value')).toBeInTheDocument();
  });
});