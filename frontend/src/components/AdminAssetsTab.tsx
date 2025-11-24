import React, { useState, useEffect, useCallback } from 'react';

import { AssetFormAdvanced } from './forms/AssetFormAdvanced';
import { useApp } from '../context/AppContext';
import { adminApi } from '../services/api';

interface Asset {
  id: number;
  symbol: string;
  name: string;
  decimals: number;
  is_active: boolean;
  created_at: string;
}

interface AssetWithPrice extends Asset {
  current_price?: number;
  price_loading?: boolean;
}

export const AdminAssetsTab: React.FC = () => {
  const { actions } = useApp();
  const [assets, setAssets] = useState<AssetWithPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.listAssets() as Asset[];
      setAssets(data.map((asset) => ({ ...asset, price_loading: true })));
      
      // Fetch current prices for each asset
      data.forEach((asset) => {
        void fetchCurrentPrice(asset.symbol, asset.id);
      });
    } catch (error: unknown) {
      actions.setError(`Failed to load assets: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [actions]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const fetchCurrentPrice = async (symbol: string, assetId: number) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(
        `/api/prices/daily?symbol=${symbol}&currency=USD&start=${today}&end=${today}`
      );
      
      if (response.ok) {
        const data: { price: number }[] = await response.json() as { price: number }[];
        if (data && data.length > 0) {
          setAssets((prev) =>
            prev.map((a) =>
              a.id === assetId
                ? { ...a, current_price: data[0].price, price_loading: false }
                : a
            )
          );
        } else {
          setAssets((prev) =>
            prev.map((a) =>
              a.id === assetId ? { ...a, price_loading: false } : a
            )
          );
        }
      } else {
        setAssets((prev) =>
          prev.map((a) =>
            a.id === assetId ? { ...a, price_loading: false } : a
          )
        );
      }
    } catch (_error) {
      setAssets((prev) =>
        prev.map((a) =>
          a.id === assetId ? { ...a, price_loading: false } : a
        )
      );
    }
  };

  const handleCreate = async (data: unknown) => {
    try {
      await adminApi.createAsset(data as Asset);
      actions.setSuccess('Asset created successfully');
      setShowForm(false);
      void loadAssets();  // added void
    } catch (error: unknown) {
      actions.setError(`Failed to create asset: ${(error as Error).message}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this asset?')) return;

    try {
      await adminApi.deleteAsset(id);
      actions.setSuccess('Asset deleted successfully');
      void loadAssets();  // added void
    } catch (error: unknown) {
      actions.setError(`Failed to delete asset: ${(error as Error).message}`);
    }
  };

  const handleToggleActive = async (asset: Asset) => {
    try {
      await adminApi.updateAsset(asset.id, {
        ...asset,
        is_active: !asset.is_active,
      });
      actions.setSuccess(`Asset ${asset.is_active ? 'deactivated' : 'activated'}`);
      void loadAssets();  // added void
    } catch (error: unknown) {
      actions.setError(`Failed to update asset: ${(error as Error).message}`);
    }
  };

  const filteredAssets = showInactive
    ? assets
    : assets.filter((a) => a.is_active !== false);

  const formatPrice = (price?: number) => {
    if (price === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(price);
  };

  if (showForm) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-6">Create New Asset</h2>
        <AssetFormAdvanced
          onSubmit={(data) => void handleCreate(data)}  // added void
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold">Assets</h2>
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="mr-2"
            />
            Show Inactive
          </label>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          + Add Asset
        </button>
      </div>

      {/* Assets Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : filteredAssets.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No assets found. Click {"Add Asset"} to create one.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Symbol
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Decimals
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current Price (USD)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAssets.map((asset) => (
                <tr key={asset.id} className={!asset.is_active ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-gray-900">
                        {asset.symbol}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{asset.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{asset.decimals}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {asset.price_loading ? (
                      <span className="text-sm text-gray-400">Loading...</span>
                    ) : asset.current_price !== undefined ? (
                      <div className="text-sm font-medium text-green-600">
                        {formatPrice(asset.current_price)}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">No price data</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        asset.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {asset.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleToggleActive(asset); }}  // added void and stopProp
                      className="text-blue-600 hover:text-blue-900"
                    >
                      {asset.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(asset.id); }}  // added void and stopProp
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">💡 Tips</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Current prices are fetched automatically for {`today's`} date</li>
          <li>• Use {"Add Asset"} to configure custom price providers</li>
          <li>• Enable auto-populate to fetch historical prices automatically</li>
          <li>• Decimals: Crypto (8), Commodities (4), Fiat (2)</li>
        </ul>
      </div>
    </div>
  );
};

