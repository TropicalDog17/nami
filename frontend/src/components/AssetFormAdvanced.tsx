import React, { useState } from 'react';

interface AssetFormData {
  symbol: string;
  name: string;
  decimals: number;
  is_active: boolean;
}

interface PriceMappingData {
  provider: string;
  provider_id: string;
  quote_currency: string;
  is_popular: boolean;
  api_endpoint?: string;
  api_config?: {
    headers?: Record<string, string>;
    query_params?: Record<string, string>;
    auth_type?: 'none' | 'bearer' | 'apikey';
    auth_value?: string;
  };
  response_path?: string;
  auto_populate: boolean;
  populate_from_date?: string;
}

interface AssetFormAdvancedProps {
  onSubmit: (data: { asset: AssetFormData; mapping?: PriceMappingData }) => void;
  onCancel: () => void;
}

const PROVIDER_TEMPLATES = {
  coingecko: {
    name: 'CoinGecko (Crypto)',
    api_endpoint: 'https://api.coingecko.com/api/v3/coins/{provider_id}/history?date={date_ddmmyyyy}&localization=false',
    response_path: 'market_data.current_price.{currency_lower}',
    example_provider_id: 'bitcoin',
    decimals: 8,
  },
  'metals-api': {
    name: 'Metals API (Gold, Silver)',
    api_endpoint: 'https://metals-api.com/api/{date}',
    api_config: {
      query_params: {
        access_key: '${METALS_API_KEY}',
        base: '{currency}',
        symbols: '{provider_id}',
      },
    },
    response_path: 'rates.{provider_id}',
    example_provider_id: 'XAU',
    decimals: 4,
  },
  custom: {
    name: 'Custom API',
    api_endpoint: '',
    response_path: '',
    example_provider_id: '',
    decimals: 8,
  },
};

export const AssetFormAdvanced: React.FC<AssetFormAdvancedProps> = ({ onSubmit, onCancel }) => {
  const [assetData, setAssetData] = useState<AssetFormData>({
    symbol: '',
    name: '',
    decimals: 8,
    is_active: true,
  });

  const [enableMapping, setEnableMapping] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<keyof typeof PROVIDER_TEMPLATES>('coingecko');
  const [mappingData, setMappingData] = useState<PriceMappingData>({
    provider: 'coingecko',
    provider_id: '',
    quote_currency: 'USD',
    is_popular: false,
    auto_populate: false,
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apiConfigJson, setApiConfigJson] = useState('{}');

  const handleAssetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setAssetData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value) : value,
    }));
  };

  const handleMappingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setMappingData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleProviderSelect = (provider: keyof typeof PROVIDER_TEMPLATES) => {
    setSelectedProvider(provider);
    const template = PROVIDER_TEMPLATES[provider];
    
    setMappingData({
      provider: provider,
      provider_id: '',
      quote_currency: 'USD',
      is_popular: false,
      api_endpoint: template.api_endpoint,
      api_config: template.api_config,
      response_path: template.response_path,
      auto_populate: false,
    });

    setAssetData((prev) => ({
      ...prev,
      decimals: template.decimals,
    }));

    if (template.api_config) {
      setApiConfigJson(JSON.stringify(template.api_config, null, 2));
    } else {
      setApiConfigJson('{}');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalMapping: PriceMappingData | undefined = undefined;
    
    if (enableMapping) {
      finalMapping = { ...mappingData };
      
      // Parse API config JSON if in advanced mode
      if (showAdvanced && apiConfigJson.trim()) {
        try {
          finalMapping.api_config = JSON.parse(apiConfigJson);
        } catch (err) {
          alert('Invalid JSON in API Configuration');
          return;
        }
      }
    }
    
    onSubmit({
      asset: assetData,
      mapping: finalMapping,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Asset Information */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">Asset Information</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Symbol* <span className="text-gray-500 text-xs">(e.g., BTC, XAU, USD)</span>
            </label>
            <input
              type="text"
              name="symbol"
              value={assetData.symbol}
              onChange={handleAssetChange}
              required
              className="w-full border border-gray-300 rounded px-3 py-2"
              placeholder="BTC"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name* <span className="text-gray-500 text-xs">(e.g., Bitcoin, Gold)</span>
            </label>
            <input
              type="text"
              name="name"
              value={assetData.name}
              onChange={handleAssetChange}
              required
              className="w-full border border-gray-300 rounded px-3 py-2"
              placeholder="Bitcoin"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Decimals <span className="text-gray-500 text-xs">(Crypto: 8, Commodities: 4, Fiat: 2)</span>
            </label>
            <input
              type="number"
              name="decimals"
              value={assetData.decimals}
              onChange={handleAssetChange}
              min="0"
              max="18"
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>

          <div className="flex items-center pt-6">
            <input
              type="checkbox"
              name="is_active"
              checked={assetData.is_active}
              onChange={handleAssetChange}
              className="mr-2"
            />
            <label className="text-sm font-medium text-gray-700">Active</label>
          </div>
        </div>
      </div>

      {/* Price Provider Configuration */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Price Provider (Optional)</h3>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={enableMapping}
              onChange={(e) => setEnableMapping(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm font-medium">Enable Price Fetching</span>
          </label>
        </div>

        {enableMapping && (
          <div className="space-y-4">
            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Provider Template
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(PROVIDER_TEMPLATES).map(([key, template]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleProviderSelect(key as keyof typeof PROVIDER_TEMPLATES)}
                    className={`px-4 py-2 rounded border ${
                      selectedProvider === key
                        ? 'bg-blue-500 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Basic Configuration */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provider ID* <span className="text-gray-500 text-xs">(e.g., {PROVIDER_TEMPLATES[selectedProvider].example_provider_id})</span>
                </label>
                <input
                  type="text"
                  name="provider_id"
                  value={mappingData.provider_id}
                  onChange={handleMappingChange}
                  required
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  placeholder={PROVIDER_TEMPLATES[selectedProvider].example_provider_id}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quote Currency
                </label>
                <input
                  type="text"
                  name="quote_currency"
                  value={mappingData.quote_currency}
                  onChange={handleMappingChange}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="USD"
                />
              </div>
            </div>

            {/* Auto-populate Options */}
            <div className="bg-blue-50 p-3 rounded border border-blue-200">
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  name="auto_populate"
                  checked={mappingData.auto_populate}
                  onChange={handleMappingChange}
                  className="mr-2"
                />
                <label className="text-sm font-medium text-gray-700">
                  Auto-populate historical prices
                </label>
              </div>

              {mappingData.auto_populate && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Populate from date
                  </label>
                  <input
                    type="date"
                    name="populate_from_date"
                    value={mappingData.populate_from_date || ''}
                    onChange={handleMappingChange}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave empty to populate from 1 year ago
                  </p>
                </div>
              )}
            </div>

            {/* Advanced Configuration Toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showAdvanced ? '▼' : '▶'} Advanced Configuration (API Endpoint, Headers, Auth)
              </button>
            </div>

            {showAdvanced && (
              <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Endpoint
                  </label>
                  <input
                    type="text"
                    name="api_endpoint"
                    value={mappingData.api_endpoint || ''}
                    onChange={handleMappingChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
                    placeholder="https://api.example.com/{date}"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use placeholders: {'{symbol}'}, {'{date}'}, {'{currency}'}, {'{provider_id}'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Response Path
                  </label>
                  <input
                    type="text"
                    name="response_path"
                    value={mappingData.response_path || ''}
                    onChange={handleMappingChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
                    placeholder="data.price"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    JSON path to extract price (e.g., rates.XAU or data.price)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Configuration (JSON)
                  </label>
                  <textarea
                    value={apiConfigJson}
                    onChange={(e) => setApiConfigJson(e.target.value)}
                    rows={8}
                    className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
                    placeholder={`{
  "headers": {"Accept": "application/json"},
  "query_params": {"key": "\${API_KEY}"},
  "auth_type": "bearer",
  "auth_value": "\${TOKEN}"
}`}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Configure headers, query params, and authentication. Use ${'${VAR}'} for env variables.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Create Asset
        </button>
      </div>
    </form>
  );
};

