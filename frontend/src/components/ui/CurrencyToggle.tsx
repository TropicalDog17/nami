import React from 'react';
import { Button } from './button';

type Currency = 'USD' | 'VND';

interface CurrencyToggleProps {
    currency: Currency;
    onCurrencyChange: (currency: Currency) => void;
}

export const CurrencyToggle: React.FC<CurrencyToggleProps> = ({
    currency,
    onCurrencyChange,
}) => {
    return (
        <div className="inline-flex rounded-md shadow-sm">
            <Button
                variant={currency === 'USD' ? 'default' : 'outline'}
                className="rounded-r-none"
                onClick={() => onCurrencyChange('USD')}
            >
                USD View
            </Button>
            <Button
                variant={currency === 'VND' ? 'default' : 'outline'}
                className="rounded-l-none"
                onClick={() => onCurrencyChange('VND')}
            >
                VND View
            </Button>
        </div>
    );
};
