import { useState, useEffect, useCallback } from 'react';

import { AdminAssetsTab } from '../components/AdminAssetsTab';
import { AdminPendingActions } from '../components/AdminPendingActions';
import DataTable from '../components/ui/DataTable';
import { useApp } from '../context/AppContext';
import { adminApi } from '../services/api';

// Removed unused PopularExpenseCategories widget

type TabId = 'types' | 'accounts' | 'assets' | 'tags' | 'pending';

type TransactionType = {
  id?: string | number;
  name?: string;
  direction?: string;
  is_active?: boolean;
  [key: string]: unknown;
};

type Account = {
  id?: string | number;
  name?: string;
  type?: string;
  is_active?: boolean;
  [key: string]: unknown;
};

type Asset = {
  id?: string | number;
  symbol?: string;
  name?: string;
  decimals?: number;
  is_active?: boolean;
  [key: string]: unknown;
};

type Tag = {
  id?: string | number;
  name?: string;
  is_active?: boolean;
  [key: string]: unknown;
};

type AdminItem = {
  id?: string | number;
  is_active?: boolean;
  [key: string]: unknown;
};

type ColumnConfig = {
  key: string;
  title: string;
  width?: string;
  type?: 'datetime';
  render?: (value: unknown) => JSX.Element;
};

const AdminPage = () => {
  const { actions, error, success } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('types');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminItem | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Data states
  const [transactionTypes, setTransactionTypes] = useState<AdminItem[]>([]);
  const [accounts, setAccounts] = useState<AdminItem[]>([]);
  const [assets, setAssets] = useState<AdminItem[]>([]);
  const [tags, setTags] = useState<AdminItem[]>([]);

  // Tabs for navigation
  const tabs: Array<{ id: TabId; name: string; icon: string }> = [
    { id: 'types', name: 'Transaction Types', icon: '⚙️' },
    { id: 'accounts', name: 'Accounts', icon: '💰' },
    { id: 'assets', name: 'Assets', icon: '📦' },
    { id: 'tags', name: 'Tags', icon: '🏷️' },
    { id: 'pending', name: 'AI Pending Actions', icon: '🤖' },
  ];

  // Auto-clear success message
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => actions.clearSuccess(), 5000);
      return () => clearTimeout(timer);
    }
  }, [success, actions]);

  // Update loadData to respect showInactive filter
  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'types': {
          const types = await adminApi.listTypes<AdminItem[]>();
          setTransactionTypes(types ?? []);
          break;
        }
        case 'accounts': {
          const accts = await adminApi.listAccounts<AdminItem[]>();
          setAccounts(accts ?? []);
          break;
        }
        case 'assets': {
          const assts = await adminApi.listAssets<AdminItem[]>();
          setAssets(assts ?? []);
          break;
        }
        case 'tags': {
          const tgs = await adminApi.listTags<AdminItem[]>();
          setTags(tgs ?? []);
          break;
        }
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message ?? 'Unknown error';
      actions.setError(`Failed to load ${activeTab}: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [activeTab, actions]);

  // Load data on tab change
  useEffect(() => {
    void loadData();
  }, [activeTab, loadData]);

  // Add filtered data computation
  const getFilteredData = () => {
    switch (activeTab) {
      case 'types':
        return showInactive
          ? transactionTypes || []
          : (transactionTypes || []).filter((t) => t.is_active);
      case 'accounts':
        return showInactive
          ? accounts || []
          : (accounts || []).filter((a) => a.is_active !== false);
      case 'assets':
        return showInactive
          ? assets || []
          : (assets || []).filter((a) => a.is_active !== false);
      case 'tags':
        return showInactive
          ? tags || []
          : (tags || []).filter((t) => t.is_active !== false);
      default:
        return [];
    }
  };

  const handleCreate = () => {
    setEditingItem(null);
    setShowForm(true);
  };

  const handleEdit = (item: AdminItem) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleDelete = async (id: string | number) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      switch (activeTab) {
        case 'types':
          await actions.deleteTransactionType(id);
          break;
        case 'accounts':
          await actions.deleteAccount(id);
          break;
        case 'assets':
          await actions.deleteAsset(id);
          break;
        case 'tags':
          await actions.deleteTag(id);
          break;
      }

      actions.setSuccess(`${activeTab.slice(0, -1)} deleted successfully`);
      await loadData(); // Reload local data (optional if we used context state for table, but AdminPage uses local state)
      // Actually AdminPage uses local state for table. We should probably switch AdminPage to use Context State too?
      // For now, keep local loadData to be safe, but actions.* will also update global state.
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message ?? 'Unknown error';
      actions.setError(`Failed to delete: ${msg}`);
    }
  };

  const handleSubmit = async (formData: Record<string, unknown>) => {
    try {
      if (editingItem) {
        const editingId = editingItem.id;
        if (editingId === undefined || editingId === null) {
          actions.setError('Selected item is missing an id.');
          return;
        }
        // Update
        switch (activeTab) {
          case 'types':
            await actions.updateTransactionType(editingId, formData as TransactionType);
            break;
          case 'accounts':
            await actions.updateAccount(editingId, formData as Account);
            break;
          case 'assets':
            await actions.updateAsset(editingId, formData as Asset);
            break;
          case 'tags':
            await actions.updateTag(editingId, formData as Tag);
            break;
        }
        actions.setSuccess(`${activeTab.slice(0, -1)} updated successfully`);
      } else {
        // Create
        switch (activeTab) {
          case 'types':
            await actions.createTransactionType(formData as TransactionType);
            break;
          case 'accounts':
            await actions.createAccount(formData as Account);
            break;
          case 'assets':
            await actions.createAsset(formData as Asset);
            break;
          case 'tags':
            await actions.createTag(formData as Tag);
            break;
        }
        actions.setSuccess(`${activeTab.slice(0, -1)} created successfully`);
      }

      // Close form immediately after successful operation
      setShowForm(false);
      setEditingItem(null);

      // Reload local data
      try {
        await loadData();
      } catch (reloadError: unknown) {
        console.warn('Failed to reload data', reloadError);
      }
    } catch (err: unknown) {
      console.error('Form submission error:', err);
      const msg = (err as { message?: string } | null)?.message ?? 'Unknown error';
      actions.setError(`Failed to save: ${msg}`);
    }
  };

  const renderForm = () => {
    if (!showForm) return null;

    return (
      <AdminForm
        type={activeTab as 'types' | 'accounts' | 'assets' | 'tags'}
        item={editingItem}
        onSubmit={handleSubmit}
        onCancel={() => {
          setShowForm(false);
          setEditingItem(null);
        }}
      />
    );
  };

  // Update renderTable to use filtered data
  const renderTable = () => {
    const data = getFilteredData();
    let columns: ColumnConfig[] = [];

    switch (activeTab) {
      case 'types':
        columns = [
          { key: 'id', title: 'ID', width: '80px' },
          { key: 'name', title: 'Name' },
          { key: 'description', title: 'Description' },
          {
            key: 'is_active',
            title: 'Status',
            render: (value: unknown) => (
              <span
                className={`px-2 py-1 rounded text-xs ${value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
              >
                {value ? 'Active' : 'Inactive'}
              </span>
            ),
          },
          { key: 'created_at', title: 'Created', type: 'datetime' },
        ];
        break;

      case 'accounts':
        columns = [
          { key: 'id', title: 'ID', width: '80px' },
          { key: 'name', title: 'Name' },
          { key: 'type', title: 'Type' },
          {
            key: 'is_active',
            title: 'Status',
            render: (value: unknown) => (
              <span
                className={`px-2 py-1 rounded text-xs ${value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
              >
                {value ? 'Active' : 'Inactive'}
              </span>
            ),
          },
          { key: 'created_at', title: 'Created', type: 'datetime' },
        ];
        break;

      case 'assets':
        columns = [
          { key: 'id', title: 'ID', width: '80px' },
          { key: 'symbol', title: 'Symbol' },
          { key: 'name', title: 'Name' },
          { key: 'decimals', title: 'Decimals' },
          {
            key: 'is_active',
            title: 'Status',
            render: (value: unknown) => (
              <span
                className={`px-2 py-1 rounded text-xs ${value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
              >
                {value ? 'Active' : 'Inactive'}
              </span>
            ),
          },
          { key: 'created_at', title: 'Created', type: 'datetime' },
        ];
        break;

      case 'tags':
        columns = [
          { key: 'id', title: 'ID', width: '80px' },
          { key: 'name', title: 'Name' },
          { key: 'category', title: 'Category' },
          {
            key: 'is_active',
            title: 'Status',
            render: (value: unknown) => (
              <span
                className={`px-2 py-1 rounded text-xs ${value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
              >
                {value ? 'Active' : 'Inactive'}
              </span>
            ),
          },
          { key: 'created_at', title: 'Created', type: 'datetime' },
        ];
        break;
    }

    return (
      <div className="space-y-4">
        {/* Add show inactive checkbox */}
        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              name="showInactive"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              data-testid="show-inactive-checkbox"
            />
            <span>Show Inactive</span>
          </label>
        </div>

        <DataTable
          key={`${activeTab}-${showInactive}`}
          data={data}
          columns={columns}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          emptyMessage={`No ${activeTab} found`}
          actions={['edit', 'delete']}
        />
      </div>
    );
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1
          className="text-2xl font-bold text-gray-900"
          data-testid="admin-page-title"
        >
          Admin Panel
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure transaction types, accounts, assets, and tags for your
          financial tracking system.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              data-testid={`admin-tab-${tab.id}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'assets' ? (
        <AdminAssetsTab />
      ) : activeTab === 'pending' ? (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <AdminPendingActions />
          </div>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h2
                className="text-lg font-medium text-gray-900"
                data-testid={`admin-section-title-${activeTab}`}
              >
                {tabs.find((t) => t.id === activeTab)?.name}
              </h2>
              <button
                onClick={handleCreate}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center space-x-2"
                data-testid="add-new-button"
              >
                <span>+</span>
                <span>Add New</span>
              </button>
            </div>

            {renderForm()}
            {renderTable()}
          </div>
        </div>
      )}

      {/* Notifications */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded flex justify-between items-center">
          <span>{error}</span>
          <button
            onClick={() => actions.clearError()}
            className="ml-2 text-red-700 hover:text-red-900 font-bold"
          >
            ×
          </button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded flex justify-between items-center">
          <span>{success}</span>
          <button
            onClick={() => actions.clearSuccess()}
            className="ml-2 text-green-700 hover:text-green-900 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {loading && <div className="loading">Loading...</div>}
    </div>
  );
};

// Form component for CRUD operations
const AdminForm: React.FC<{ type: 'types' | 'accounts' | 'assets' | 'tags'; item: AdminItem | null; onSubmit: (data: Record<string, unknown>) => Promise<void> | void; onCancel: () => void }> = ({ type, item, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (item) {
      setFormData(item);
    } else {
      // Initialize empty form based on type
      switch (type) {
        case 'types':
          setFormData({ name: '', description: '', is_active: true });
          break;
        case 'accounts':
          setFormData({ name: '', type: '', is_active: true });
          break;
        case 'assets':
          setFormData({ symbol: '', name: '', decimals: 8, is_active: true });
          break;
        case 'tags':
          setFormData({ name: '', category: '', is_active: true });
          break;
      }
    }
  }, [item, type]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const { name } = target;
    let nextValue: unknown = target.value;

    if (target instanceof HTMLInputElement) {
      if (target.type === 'checkbox') {
        nextValue = target.checked;
      } else if (target.type === 'number') {
        const parsed = Number(target.value);
        nextValue = Number.isNaN(parsed) ? '' : parsed;
      }
    }

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSubmit(formData);
  };

  const renderFields = () => {
    switch (type) {
      case 'types':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name*
              </label>
              <input
                type="text"
                name="name"
                value={String(formData.name as string ?? '')}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="e.g., buy, sell, expense"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={String(formData.description as string ?? '')}
                onChange={handleChange}
                rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="Describe this transaction type"
              />
            </div>
          </>
        );

      case 'accounts':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name*
              </label>
              <input
                type="text"
                name="name"
                value={String(formData.name as string ?? '')}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="e.g., Cash, Bank, CreditCard"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                name="type"
                value={String(formData.type as string ?? '')}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">Select Type</option>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
                <option value="CreditCard">Credit Card</option>
                <option value="Exchange">Exchange</option>
                <option value="Investment">Investment</option>
                <option value="Peer">Peer</option>
              </select>
            </div>
          </>
        );

      case 'assets':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Symbol*
              </label>
              <input
                type="text"
                name="symbol"
                value={String(formData.symbol as string ?? '')}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="e.g., USD, BTC, ETH"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                name="name"
                value={String(formData.name as string ?? '')}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="e.g., US Dollar, Bitcoin"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Decimals
              </label>
              <input
                type="number"
                name="decimals"
                value={Number(formData.decimals as number ?? 8)}
                onChange={handleChange}
                min="0"
                max="18"
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
          </>
        );

      case 'tags':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name*
              </label>
              <input
                type="text"
                name="name"
                value={String(formData.name as string ?? '')}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="e.g., Food, Housing, Investment"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                name="category"
                value={String(formData.category as string ?? '')}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">Select Category</option>
                <option value="Expense">Expense</option>
                <option value="Income">Income</option>
                <option value="Investment">Investment</option>
                <option value="Transfer">Transfer</option>
              </select>
            </div>
          </>
        );
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg mb-6" data-testid="admin-form">
      <h3
        className="text-lg font-medium text-gray-900 mb-4"
        data-testid="admin-form-title"
      >
        {item ? 'Edit' : 'Create New'} {type.slice(0, -1)}
      </h3>

      <form onSubmit={handleSubmit} data-testid="admin-form-element">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {renderFields()}

          <div className="flex items-center">
            <input
              type="checkbox"
              name="is_active"
              checked={Boolean((formData).is_active)}
              onChange={handleChange}
              className="mr-2"
            />
            <label className="text-sm font-medium text-gray-700">Active</label>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            data-testid="admin-form-submit"
          >
            {item ? 'Update' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
            data-testid="admin-form-cancel"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminPage;
