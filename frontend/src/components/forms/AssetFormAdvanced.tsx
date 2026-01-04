import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    onSubmit: (data: {
        asset: AssetFormData;
        mapping?: PriceMappingData;
    }) => void;
    onCancel: () => void;
}

const PROVIDER_TEMPLATES = {
    coingecko: {
        name: 'CoinGecko (Crypto)',
        api_endpoint:
            'https://api.coingecko.com/api/v3/coins/{provider_id}/history?date={date_ddmmyyyy}&localization=false',
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

export const AssetFormAdvanced: React.FC<AssetFormAdvancedProps> = ({
    onSubmit,
    onCancel,
}) => {
    const [assetData, setAssetData] = useState<AssetFormData>({
        symbol: '',
        name: '',
        decimals: 8,
        is_active: true,
    });

    const [enableMapping, setEnableMapping] = useState(false);
    const [selectedProvider, setSelectedProvider] =
        useState<keyof typeof PROVIDER_TEMPLATES>('coingecko');
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
            [name]:
                type === 'checkbox'
                    ? checked
                    : type === 'number'
                      ? parseInt(value)
                      : value,
        }));
    };

    const handleMappingChange = (
        e: React.ChangeEvent<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >
    ) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setMappingData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleProviderSelect = (
        provider: keyof typeof PROVIDER_TEMPLATES
    ) => {
        setSelectedProvider(provider);
        const template = PROVIDER_TEMPLATES[provider];

        setMappingData({
            provider: provider,
            provider_id: '',
            quote_currency: 'USD',
            is_popular: false,
            api_endpoint: template.api_endpoint,
            api_config: template.api_config as PriceMappingData['api_config'],
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
                    finalMapping.api_config = JSON.parse(
                        apiConfigJson
                    ) as NonNullable<PriceMappingData['api_config']>;
                } catch (_err) {
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
            <Card>
                <CardHeader>
                    <CardTitle>Asset Information</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="symbol">
                                Symbol*{' '}
                                <span className="text-muted-foreground text-xs">
                                    (e.g., BTC, XAU, USD)
                                </span>
                            </Label>
                            <Input
                                id="symbol"
                                type="text"
                                name="symbol"
                                value={assetData.symbol}
                                onChange={handleAssetChange}
                                required
                                placeholder="BTC"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="name">
                                Name*{' '}
                                <span className="text-muted-foreground text-xs">
                                    (e.g., Bitcoin, Gold)
                                </span>
                            </Label>
                            <Input
                                id="name"
                                type="text"
                                name="name"
                                value={assetData.name}
                                onChange={handleAssetChange}
                                required
                                placeholder="Bitcoin"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="decimals">
                                Decimals{' '}
                                <span className="text-muted-foreground text-xs">
                                    (Crypto: 8, Commodities: 4, Fiat: 2)
                                </span>
                            </Label>
                            <Input
                                id="decimals"
                                type="number"
                                name="decimals"
                                value={assetData.decimals}
                                onChange={handleAssetChange}
                                min="0"
                                max="18"
                            />
                        </div>

                        <div className="flex items-center pt-6">
                            <Checkbox
                                id="is_active"
                                name="is_active"
                                checked={assetData.is_active}
                                onCheckedChange={(checked) => {
                                    setAssetData((prev) => ({
                                        ...prev,
                                        is_active: Boolean(checked),
                                    }));
                                }}
                            />
                            <Label
                                htmlFor="is_active"
                                className="ml-2 cursor-pointer"
                            >
                                Active
                            </Label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Price Provider Configuration */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Price Provider (Optional)</CardTitle>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="enableMapping"
                                checked={enableMapping}
                                onCheckedChange={(checked) =>
                                    setEnableMapping(Boolean(checked))
                                }
                            />
                            <Label
                                htmlFor="enableMapping"
                                className="cursor-pointer"
                            >
                                Enable Price Fetching
                            </Label>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {enableMapping && (
                        <div className="space-y-4">
                            {/* Provider Selection */}
                            <div className="space-y-2">
                                <Label>Select Provider Template</Label>
                                <div className="grid grid-cols-3 gap-2">
                                    {Object.entries(PROVIDER_TEMPLATES).map(
                                        ([key, template]) => (
                                            <Button
                                                key={key}
                                                type="button"
                                                variant={
                                                    selectedProvider === key
                                                        ? 'default'
                                                        : 'outline'
                                                }
                                                onClick={() =>
                                                    handleProviderSelect(
                                                        key as keyof typeof PROVIDER_TEMPLATES
                                                    )
                                                }
                                            >
                                                {template.name}
                                            </Button>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* Basic Configuration */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="provider_id">
                                        Provider ID*{' '}
                                        <span className="text-muted-foreground text-xs">
                                            (e.g.,{' '}
                                            {
                                                PROVIDER_TEMPLATES[
                                                    selectedProvider
                                                ].example_provider_id
                                            }
                                            )
                                        </span>
                                    </Label>
                                    <Input
                                        id="provider_id"
                                        type="text"
                                        name="provider_id"
                                        value={mappingData.provider_id}
                                        onChange={handleMappingChange}
                                        required
                                        placeholder={
                                            PROVIDER_TEMPLATES[selectedProvider]
                                                .example_provider_id
                                        }
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="quote_currency">
                                        Quote Currency
                                    </Label>
                                    <Input
                                        id="quote_currency"
                                        type="text"
                                        name="quote_currency"
                                        value={mappingData.quote_currency}
                                        onChange={handleMappingChange}
                                        placeholder="USD"
                                    />
                                </div>
                            </div>

                            {/* Auto-populate Options */}
                            <div className="bg-muted p-3 rounded border">
                                <div className="flex items-center mb-2 space-x-2">
                                    <Checkbox
                                        id="auto_populate"
                                        name="auto_populate"
                                        checked={mappingData.auto_populate}
                                        onCheckedChange={(checked) => {
                                            setMappingData((prev) => ({
                                                ...prev,
                                                auto_populate: Boolean(checked),
                                            }));
                                        }}
                                    />
                                    <Label
                                        htmlFor="auto_populate"
                                        className="cursor-pointer"
                                    >
                                        Auto-populate historical prices
                                    </Label>
                                </div>

                                {mappingData.auto_populate && (
                                    <div className="mt-2 space-y-2">
                                        <Label htmlFor="populate_from_date">
                                            Populate from date
                                        </Label>
                                        <Input
                                            id="populate_from_date"
                                            type="date"
                                            name="populate_from_date"
                                            value={
                                                mappingData.populate_from_date ??
                                                ''
                                            }
                                            onChange={handleMappingChange}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Leave empty to populate from 1 year
                                            ago
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Advanced Configuration Toggle */}
                            <div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        setShowAdvanced(!showAdvanced)
                                    }
                                    className="text-sm"
                                >
                                    {showAdvanced ? '▼' : '▶'} Advanced
                                    Configuration (API Endpoint, Headers, Auth)
                                </Button>
                            </div>

                            {showAdvanced && (
                                <div className="space-y-4 pl-4 border-l-2 border-border">
                                    <div className="space-y-2">
                                        <Label htmlFor="api_endpoint">
                                            API Endpoint
                                        </Label>
                                        <Input
                                            id="api_endpoint"
                                            type="text"
                                            name="api_endpoint"
                                            value={
                                                mappingData.api_endpoint ?? ''
                                            }
                                            onChange={handleMappingChange}
                                            className="font-mono text-sm"
                                            placeholder="https://api.example.com/{date}"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Use placeholders: {'{symbol}'},{' '}
                                            {'{date}'}, {'{currency}'},{' '}
                                            {'{provider_id}'}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="response_path">
                                            Response Path
                                        </Label>
                                        <Input
                                            id="response_path"
                                            type="text"
                                            name="response_path"
                                            value={
                                                mappingData.response_path ?? ''
                                            }
                                            onChange={handleMappingChange}
                                            className="font-mono text-sm"
                                            placeholder="data.price"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            JSON path to extract price (e.g.,
                                            rates.XAU or data.price)
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="api_config">
                                            API Configuration (JSON)
                                        </Label>
                                        <textarea
                                            id="api_config"
                                            value={apiConfigJson}
                                            onChange={(e) =>
                                                setApiConfigJson(e.target.value)
                                            }
                                            rows={8}
                                            className="w-full px-3 py-2 border border-input rounded-md font-mono text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                            placeholder={`{
  "headers": {"Accept": "application/json"},
  "query_params": {"key": "\${API_KEY}"},
  "auth_type": "bearer",
  "auth_value": "\${TOKEN}"
}`}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Configure headers, query params, and
                                            authentication. Use ${'${VAR}'} for
                                            env variables.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit">Create Asset</Button>
            </div>
        </form>
    );
};
