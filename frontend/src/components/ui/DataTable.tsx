import React, { useState, useMemo } from 'react';

type Row = { id?: string | number; [key: string]: any };
type Column = {
  key: string;
  title: string;
  width?: number | string;
  type?: 'date' | 'datetime' | 'currency' | 'number' | 'text' | string;
  currency?: string;
  editable?: boolean;
  editType?: 'select' | 'date' | 'number' | 'text' | string;
  decimals?: number;
  render?: (value: any, column: Column, row: Row) => React.ReactNode;
};
type Option = { value: string; label: string };
type MasterData = Record<string, Option[]>;

type Props = {
  data?: Row[];
  columns?: Column[];
  loading?: boolean;
  error?: any;
  sortable?: boolean;
  filterable?: boolean;
  pagination?: boolean;
  pageSize?: number;
  onRowClick?: ((row: Row) => void) | null;
  className?: string;
  emptyMessage?: string;
  editable?: boolean;
  onCellEdit?: ((rowId: string | number, columnKey: string, newValue: any) => Promise<void>) | null;
  masterData?: MasterData;
  actions?: Array<'view' | 'edit' | 'delete' | 'recalc' | string>;
  onEdit?: ((row: Row) => void) | null;
  onDelete?: ((id: string | number) => void | Promise<void>) | null;
  onRecalc?: ((row: Row) => void | Promise<void>) | null;
  onView?: ((row: Row) => void) | null;
  busyRowIds?: Set<string | number>;
};

const DataTable: React.FC<Props> = ({
  data = [],
  columns = [],
  loading = false,
  error = null,
  sortable = true,
  filterable = true,
  pagination = true,
  pageSize = 10,
  onRowClick = null,
  className = '',
  emptyMessage = 'No data available',
  editable = false,
  onCellEdit = null,
  masterData = {},
  actions = [],
  onEdit = null,
  onDelete = null,
  onRecalc = null,
  onView = null,
  busyRowIds = new Set(),
}) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Helper function to get nested values
  const getNestedValue = (obj: Record<string, any>, path: string) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  // Sort data
  const sortedData = useMemo<Row[]>(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      const aValue = getNestedValue(a, sortConfig.key);
      const bValue = getNestedValue(b, sortConfig.key);

      if (aValue === null) return 1;
      if (bValue === null) return -1;
      if (aValue === bValue) return 0;

      const comparison = aValue < bValue ? -1 : 1;
      return sortConfig.direction === 'desc' ? comparison * -1 : comparison;
    });
  }, [data, sortConfig]);

  // Filter data
  const filteredData = useMemo<Row[]>(() => {
    if (!filterText) return sortedData;

    const searchTerm = filterText.toLowerCase();
    return sortedData.filter((row) =>
      columns.some((column) => {
        const value = getNestedValue(row, column.key);
        return value && value.toString().toLowerCase().includes(searchTerm);
      })
    );
  }, [sortedData, filterText, columns]);

  // Paginate data
  const paginatedData = useMemo<Row[]>(() => {
    if (!pagination) return filteredData;

    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize, pagination]);

  const totalPages = Math.ceil(filteredData.length / pageSize);

  // Handle inline editing
  const startEditing = (rowId: string | number, columnKey: string, currentValue: any) => {
    if (!editable) return;
    setEditingCell({ rowId, columnKey });
    setEditValue(currentValue || '');
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEditing = async () => {
    if (!editingCell || !onCellEdit) return;

    try {
      await onCellEdit(editingCell.rowId, editingCell.columnKey, editValue);
      setEditingCell(null);
      setEditValue('');
    } catch (error) {
      console.error('Failed to save edit:', error);
      // Keep editing mode active on error
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditing();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  // Render edit input based on editType
  const renderEditInput = (column: Column, currentValue: any) => {
    const commonProps = {
      value: editValue,
      onChange: (e) => setEditValue(e.target.value),
      onKeyDown: handleKeyDown,
      onBlur: saveEditing,
      autoFocus: true,
      className: 'w-full px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
    } as const;

    switch (column.editType) {
      case 'select':
        return (
          <select {...commonProps}>
            <option value="">Select...</option>
            {masterData[column.key]?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'date':
        return (
          <input
            {...commonProps}
            type="date"
            value={editValue ? new Date(editValue).toISOString().split('T')[0] : ''}
            onChange={(e) => setEditValue(e.target.value)}
          />
        );

      case 'number':
        return (
          <input
            {...commonProps}
            type="number"
            step={column.decimals ? Math.pow(10, -column.decimals) : 'any'}
          />
        );

      case 'text':
      default:
        return <input {...commonProps} type="text" />;
    }
  };

  // Handle sort
  const handleSort = (key: string) => {
    if (!sortable) return;

    setSortConfig((prevConfig) => ({
      key,
      direction:
        prevConfig.key === key && prevConfig.direction === 'asc'
          ? 'desc'
          : 'asc',
    }));
  };

  // Format cell value
  const formatCellValue = (value: any, column: Column, row: Row) => {
    if (value === null || value === undefined) return '-';

    if (column.render) {
      return column.render(value, column, row);
    }

    if (column.type === 'datetime') {
      return new Date(value).toLocaleString();
    }

    if (column.type === 'date') {
      return new Date(value).toLocaleDateString();
    }

    if (column.type === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: column.currency || 'USD',
      }).format(value);
    }

    if (column.type === 'number') {
      return typeof value === 'number' ? value.toLocaleString() : value;
    }

    return value.toString();
  };

  // Render action buttons
  const renderActions = (row: Row) => {
    if (!actions || actions.length === 0) return null;

    return (
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium sticky right-0 bg-white">
        <div className="flex space-x-2 justify-center">
          {actions.includes('view') && onView && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView(row);
              }}
              className="text-blue-600 hover:text-blue-900"
              title="View"
              data-testid="datatable-view-button"
            >
              👁️
            </button>
          )}
          {actions.includes('edit') && onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(row);
              }}
              className="text-indigo-600 hover:text-indigo-900"
              title="Edit"
              data-testid="datatable-edit-button"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 3.487a2.25 2.25 0 013.182 3.182L7.5 19.313 3 21l1.687-4.5L16.862 3.487z" />
              </svg>
            </button>
          )}
          {actions.includes('delete') && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(row.id as string | number);
              }}
              className="text-red-600 hover:text-red-900"
              title="Delete"
              data-testid="datatable-delete-button"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-9 0h10" />
              </svg>
            </button>
          )}
          {actions.includes('recalc') && onRecalc && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRecalc(row);
              }}
              className={`text-gray-600 hover:text-gray-900 ${busyRowIds?.has?.(row.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!!busyRowIds?.has?.(row.id)}
              title="Refresh"
              data-testid="datatable-recalc-button"
            >
              {busyRowIds?.has?.(row.id) ? (
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0019 5" />
                </svg>
              )}
            </button>
          )}
        </div>
      </td>
    );
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">
              Error loading data
            </h3>
            <div className="mt-2 text-sm text-red-700">
              {error.message || error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Filter */}
      {filterable && (
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              data-testid="datatable-search-input"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                className="h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg w-full">
        <table
          className="min-w-full w-full divide-y divide-gray-300"
          data-testid="datatable"
        >
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  style={{ width: column.width }}
                  onClick={() => sortable && handleSort(column.key)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.title}</span>
                    {sortable && (
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                        />
                      </svg>
                    )}
                  </div>
                </th>
              ))}
              {actions && actions.length > 0 && (
                <th scope="col" className="relative px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-10">
                  <span className="sr-only">Actions</span>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + (actions.length > 0 ? 1 : 0)}
                  className="px-6 py-12 text-center"
                >
                  <div className="flex justify-center items-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-500"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span className="text-gray-500">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (actions.length > 0 ? 1 : 0)}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <tr
                  key={row.id || rowIndex}
                  className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick && onRowClick(row)}
                >
                  {columns.map((column) => {
                    const cellValue = getNestedValue(row, column.key);
                    const isEditing = editingCell?.rowId === row.id && editingCell?.columnKey === column.key;
                    const isEditable = editable && column.editable;

                    return (
                      <td
                        key={column.key}
                        className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 group ${
                          isEditable ? 'cursor-pointer hover:bg-blue-50' : ''
                        }`}
                        onClick={() => isEditable && !isEditing && startEditing(row.id, column.key, cellValue)}
                      >
                        {isEditing ? (
                          renderEditInput(column, cellValue)
                        ) : (
                          <>
                            {formatCellValue(cellValue, column, row)}
                            {isEditable && (
                              <span className="ml-1 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 3.487a2.25 2.25 0 013.182 3.182L7.5 19.313 3 21l1.687-4.5L16.862 3.487z" />
                                </svg>
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                  {renderActions(row)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && !loading && paginatedData.length > 0 && (
        <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing{' '}
                  {Math.min(
                    (currentPage - 1) * pageSize + 1,
                    filteredData.length
                  )}{' '}
                  to {Math.min(currentPage * pageSize, filteredData.length)} of{' '}
                  {filteredData.length} results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum
                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
