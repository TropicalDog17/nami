import React, { useState, useEffect } from 'react';

import { AdminAssetsTab } from '../components/AdminAssetsTab';
import DataTable from '../components/ui/DataTable';
import { useApp } from '../context/AppContext';
import { adminApi } from '../services/api';

const PopularExpenseCategories = () => {
  const { tags, actions } = useApp();
  const popularCategories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Healthcare'];

  const ensurePopularCategories = async () => {
    for (const category of popularCategories) {
      const exists = tags.some(tag => tag.name === category);
      if (!exists) {
        await actions.createTag({
          name: category,
          category: 'expense',
          is_active: true
        });
      }
    }
  };

  useEffect(() => {
    ensurePopularCategories();
  }, []);

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Expense Categories</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {popularCategories.map(category => (
          <div key={category} className="p-3 bg-gray-50 rounded text-center">
            {category}
          </div>
        ))}
      </div>
    </div>
  );
};

const AdminPage = () => {
  const { actions, error, success } = useApp();
  const [activeTab, setActiveTab] = useState('types');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  // Data states
  const [transactionTypes, setTransactionTypes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [assets, setAssets] = useState([]);
  const [tags, setTags] = useState([]);

  // Tabs for navigation
  const tabs = [
    { id: 'types', name: 'Transaction Types', icon: '⚙️' },
    { id: 'accounts', name: 'Accounts', icon: '💰' },
    { id: 'assets', name: 'Assets', icon: '📦' },
    { id: 'tags', name: 'Tags', icon: '🏷️' },
  ];

  // Auto-clear success message
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => actions.clearSuccess(), 5000);
      return () => clearTimeout(timer);
    }
  }, [success, actions]);

  // Update loadData to respect showInactive filter
  const loadData = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'types':
          const types = await adminApi.listTypes();
          setTransactionTypes(types);
          break;
        case 'accounts':
          const accts = await adminApi.listAccounts();
          setAccounts(accts);
          break;
        case 'assets':
          const assts = await adminApi.listAssets();
          setAssets(assts);
          break;
        case 'tags':
          const tgs = await adminApi.listTags();
          setTags(tgs);
          break;
      }
    } catch (error) {
      actions.setError(`Failed to load ${activeTab}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load data on tab change
  useEffect(() => {
    loadData();
  }, [activeTab]);

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

  const handleEdit = (item) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      switch (activeTab) {
        case 'types':
          await adminApi.deleteType(id);
          break;
        case 'accounts':
          await adminApi.deleteAccount(id);
          break;
        case 'assets':
          await adminApi.deleteAsset(id);
          break;
        case 'tags':
          await adminApi.deleteTag(id);
          break;
      }

      actions.setSuccess(`${activeTab.slice(0, -1)} deleted successfully`);
      await loadData(); // Reload data to reflect the changes
    } catch (error) {
      actions.setError(`Failed to delete: ${error.message}`);
    }
  };

  const handleSubmit = async (formData) => {
    console.log('Form submission started', {
      formData,
      activeTab,
      editingItem,
    });
    try {
      if (editingItem) {
        console.log('Updating item...');
        // Update
        switch (activeTab) {
          case 'types':
            await adminApi.updateType(editingItem.id, formData);
            break;
          case 'accounts':
            await adminApi.updateAccount(editingItem.id, formData);
            break;
          case 'assets':
            await adminApi.updateAsset(editingItem.id, formData);
            break;
          case 'tags':
            await adminApi.updateTag(editingItem.id, formData);
            break;
        }
        console.log('Item updated, setting success message');
        actions.setSuccess(`${activeTab.slice(0, -1)} updated successfully`);
      } else {
        console.log('Creating new item...');
        // Create
        switch (activeTab) {
          case 'types':
            console.log('Creating type with data:', formData);
            await adminApi.createType(formData);
            console.log('Type created successfully');
            break;
          case 'accounts':
            await adminApi.createAccount(formData);
            break;
          case 'assets':
            await adminApi.createAsset(formData);
            break;
          case 'tags':
            await adminApi.createTag(formData);
            break;
        }
        console.log('Item created, setting success message');
        actions.setSuccess(`${activeTab.slice(0, -1)} created successfully`);
      }

      console.log('Closing form...');
      // Close form immediately after successful operation
      setShowForm(false);
      setEditingItem(null);

      console.log('Reloading data...');
      // Try to reload data, but don't fail if it doesn't work
      try {
        await loadData();
        console.log('Data reloaded successfully');
      } catch (reloadError) {
        console.warn(
          'Failed to reload data after form submission:',
          reloadError
        );
        // Don't show error to user since the main operation succeeded
      }
      console.log('Form submission completed successfully');
    } catch (error) {
      console.error('Form submission error:', error);
      actions.setError(`Failed to save: ${error.message}`);
    }
  };

  const renderForm = () => {
    if (!showForm) return null;

    return (
      <AdminForm
        type={activeTab}
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
    let columns = [];

    switch (activeTab) {
      case 'types':
        columns = [
          { key: 'id', title: 'ID', width: '80px' },
          { key: 'name', title: 'Name' },
          { key: 'description', title: 'Description' },
          {
            key: 'is_active',
            title: 'Status',
            render: (value) => (
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
            render: (value) => (
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
            render: (value) => (
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
            render: (value) => (
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
const AdminForm = ({ type, item, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({});

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

  const handleChange = (e) => {
    const { name, value, type: inputType, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        inputType === 'checkbox'
          ? checked
          : inputType === 'number'
            ? parseInt(value)
            : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
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
                value={formData.name || ''}
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
                value={formData.description || ''}
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
                value={formData.name || ''}
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
                value={formData.type || ''}
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
                value={formData.symbol || ''}
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
                value={formData.name || ''}
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
                value={formData.decimals || 8}
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
                value={formData.name || ''}
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
                value={formData.category || ''}
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
              checked={formData.is_active || false}
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
