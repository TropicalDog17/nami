// Currency formatting utilities for production-ready display

// Configuration for different currencies
export const CURRENCY_CONFIG = {
  USD: {
    symbol: '$',
    symbolPosition: 'before', // 'before' or 'after'
    decimalPlaces: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  VND: {
    symbol: '₫',
    symbolPosition: 'after',
    decimalPlaces: 0, // VND typically doesn't show decimals
    thousandsSeparator: '.',
    decimalSeparator: ',',
  },
  BTC: {
    symbol: '₿',
    symbolPosition: 'before',
    decimalPlaces: 8, // Bitcoin needs more precision
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  ETH: {
    symbol: 'ETH',
    symbolPosition: 'after',
    decimalPlaces: 6, // Ethereum needs medium precision
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  USDT: {
    symbol: 'USDT',
    symbolPosition: 'after',
    decimalPlaces: 4, // Tether needs more precision than USD
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  USDC: {
    symbol: 'USDC',
    symbolPosition: 'after',
    decimalPlaces: 4, // USD Coin needs more precision than USD
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  EUR: {
    symbol: '€',
    symbolPosition: 'before',
    decimalPlaces: 2,
    thousandsSeparator: ' ',
    decimalSeparator: ',',
  },
  JPY: {
    symbol: '¥',
    symbolPosition: 'before',
    decimalPlaces: 0, // JPY doesn't show decimals
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
};

// Default config for unknown currencies
const DEFAULT_CONFIG = {
  symbol: '',
  symbolPosition: 'after',
  decimalPlaces: 2,
  thousandsSeparator: ',',
  decimalSeparator: '.',
};

/**
 * Format a number with proper decimal places and separators
 * @param {number} value - The numeric value to format
 * @param {number} decimalPlaces - Number of decimal places
 * @param {string} thousandsSeparator - Character for thousands separator
 * @param {string} decimalSeparator - Character for decimal separator
 * @returns {string} - Formatted number
 */
function formatNumber(value, decimalPlaces, thousandsSeparator, decimalSeparator) {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  const fixedValue = value.toFixed(decimalPlaces);
  const [integerPart, decimalPart] = fixedValue.split('.');

  // Add thousands separator
  let formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);

  // Combine integer and decimal parts
  if (decimalPlaces > 0 && decimalPart) {
    return `${formattedInteger}${decimalSeparator}${decimalPart}`;
  }

  return formattedInteger;
}

/**
 * Format currency with proper symbol and formatting
 * @param {number} value - The numeric value
 * @param {string} currency - Currency code (USD, VND, BTC, etc.)
 * @param {Object} options - Additional formatting options
 * @returns {string} - Formatted currency string
 */
export function formatCurrency(value, currency = 'USD', options = {}) {
  const config = CURRENCY_CONFIG[currency.toUpperCase()] || DEFAULT_CONFIG;

  // Override config with options
  const finalConfig = {
    ...config,
    ...options,
  };

  const formattedNumber = formatNumber(
    value,
    finalConfig.decimalPlaces,
    finalConfig.thousandsSeparator,
    finalConfig.decimalSeparator
  );

  // Handle negative values
  const isNegative = value < 0;
  const absoluteValue = isNegative ? -value : value;
  const formattedAbsoluteNumber = formatNumber(
    absoluteValue,
    finalConfig.decimalPlaces,
    finalConfig.thousandsSeparator,
    finalConfig.decimalSeparator
  );

  let result = '';

  if (finalConfig.symbolPosition === 'before') {
    result = `${finalConfig.symbol}${formattedAbsoluteNumber}`;
  } else {
    result = `${formattedAbsoluteNumber} ${finalConfig.symbol}`.trim();
  }

  return isNegative ? `-${result}` : result;
}

/**
 * Format percentage with proper decimal places
 * @param {number} value - The percentage value (e.g., 0.1567 for 15.67%)
 * @param {number} decimalPlaces - Number of decimal places
 * @returns {string} - Formatted percentage string
 */
export function formatPercentage(value, decimalPlaces = 2) {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00%';
  }

  const percentage = value * 100;
  const formatted = formatNumber(percentage, decimalPlaces, ',', '.');
  return `${formatted}%`;
}

/**
 * Format large numbers with abbreviations (K, M, B, T)
 * @param {number} value - The numeric value
 * @param {number} decimalPlaces - Number of decimal places
 * @returns {string} - Formatted number with abbreviation
 */
export function formatLargeNumber(value, decimalPlaces = 2) {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  const absValue = Math.abs(value);

  if (absValue >= 1e12) {
    return `${(value / 1e12).toFixed(decimalPlaces)}T`;
  } else if (absValue >= 1e9) {
    return `${(value / 1e9).toFixed(decimalPlaces)}B`;
  } else if (absValue >= 1e6) {
    return `${(value / 1e6).toFixed(decimalPlaces)}M`;
  } else if (absValue >= 1e3) {
    return `${(value / 1e3).toFixed(decimalPlaces)}K`;
  }

  return value.toFixed(decimalPlaces);
}

/**
 * Format cryptocurrency amounts with appropriate precision
 * @param {number} value - The crypto amount
 * @param {string} symbol - Crypto symbol (BTC, ETH, etc.)
 * @returns {string} - Formatted crypto amount
 */
export function formatCrypto(value, symbol = 'BTC') {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  const cryptoConfig = CURRENCY_CONFIG[symbol.toUpperCase()];
  if (!cryptoConfig) {
    // Default to 8 decimal places for unknown crypto
    return `${value.toFixed(8)} ${symbol}`;
  }

  const formattedNumber = formatNumber(
    value,
    cryptoConfig.decimalPlaces,
    cryptoConfig.thousandsSeparator,
    cryptoConfig.decimalSeparator
  );

  if (cryptoConfig.symbolPosition === 'before') {
    return `${cryptoConfig.symbol}${formattedNumber}`;
  } else {
    return `${formattedNumber} ${cryptoConfig.symbol}`.trim();
  }
}

/**
 * Parse a formatted currency string back to a number
 * @param {string} formattedValue - The formatted currency string
 * @param {string} currency - Currency code
 * @returns {number} - The numeric value
 */
export function parseCurrency(formattedValue, currency = 'USD') {
  if (!formattedValue || typeof formattedValue !== 'string') {
    return 0;
  }

  const config = CURRENCY_CONFIG[currency.toUpperCase()] || DEFAULT_CONFIG;

  // Remove currency symbol and whitespace
  let cleanValue = formattedValue.trim();

  if (config.symbolPosition === 'before') {
    cleanValue = cleanValue.replace(new RegExp(`^\\${config.symbol}\\s*`), '');
  } else {
    cleanValue = cleanValue.replace(new RegExp(`\\s*${config.symbol}\\s*$`), '');
  }

  // Remove thousands separator and replace decimal separator
  cleanValue = cleanValue.replace(new RegExp(`\\${config.thousandsSeparator}`, 'g'), '');
  cleanValue = cleanValue.replace(config.decimalSeparator, '.');

  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Get the appropriate number of decimal places for a currency
 * @param {string} currency - Currency code
 * @returns {number} - Number of decimal places
 */
export function getDecimalPlaces(currency) {
  const config = CURRENCY_CONFIG[currency.toUpperCase()] || DEFAULT_CONFIG;
  return config.decimalPlaces;
}

/**
 * Format PnL with color indicator (for display purposes)
 * @param {number} value - PnL value
 * @param {string} currency - Currency code
 * @returns {object} - Formatted value and color information
 */
export function formatPnL(value, currency = 'USD') {
  const formattedValue = formatCurrency(value, currency);
  const isPositive = value > 0;
  const isNegative = value < 0;
  const isZero = value === 0;

  return {
    value: formattedValue,
    isPositive,
    isNegative,
    isZero,
    colorClass: isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-600',
    sign: isPositive ? '+' : isNegative ? '-' : '',
  };
}

export default {
  formatCurrency,
  formatPercentage,
  formatLargeNumber,
  formatCrypto,
  parseCurrency,
  getDecimalPlaces,
  formatPnL,
  CURRENCY_CONFIG,
};