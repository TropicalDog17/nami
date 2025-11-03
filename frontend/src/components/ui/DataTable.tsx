import React, { useState, useMemo } from 'react';

export type TableRowBase = { id?: string | number } & Record<string, unknown>;
export type TableColumn<TRow extends TableRowBase> = {
  key: string;
  title: string;
  width?: number | string;
  type?: 'date' | 'datetime' | 'currency' | 'number' | 'text' | (string & {});
  currency?: string;
  editable?: boolean;
  editType?: 'select' | 'date' | 'number' | 'text' | (string & {});
  decimals?: number;
  render?: (value: unknown, column: TableColumn<TRow>, row: TRow) => React.ReactNode;
};
type Option = { value: string; label: string };
type MasterData = Record<string, Option[]>;

type Props<TRow extends TableRowBase> = {
  data?: TRow[];
  columns?: TableColumn<TRow>[];
  loading?: boolean;
  error?: unknown;
  sortable?: boolean;
  filterable?: boolean;
  pagination?: boolean;
  pageSize?: number;
  onRowClick?: ((row: TRow) => void) | null;
  className?: string;
  emptyMessage?: string;
  editable?: boolean;
  onCellEdit?: ((rowId: string | number, columnKey: string, newValue: unknown) => Promise<void>) | null;
  masterData?: MasterData;
  actions?: Array<'view' | 'edit' | 'delete' | 'recalc' | (string & {})>;
  onEdit?: ((row: TRow) => void) | null;
  onDelete?: ((id: string | number) => void | Promise<void>) | null;
  onRecalc?: ((row: TRow) => void | Promise<void>) | null;
  onView?: ((row: TRow) => void) | null;
  busyRowIds?: Set<string | number>;
  // Selection for bulk actions
  selectableRows?: boolean;
  selectedIds?: Set<string | number>;
  onToggleRow?: (id: string | number, checked: boolean) => void;
  onToggleAll?: (checked: boolean, visibleIds: Array<string | number>) => void;
};

const DataTable = <TRow extends TableRowBase>({
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
  selectableRows = false,
  selectedIds = new Set(),
  onToggleRow,
  onToggleAll,
}: Props<TRow>) => {
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingCell, setEditingCell] = useState<{ rowId: string | number; columnKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Helper function to get nested values
  const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
    return path.split('.').reduce<unknown>((current: unknown, key: string) => {
      if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  };

  // Sort data
  const sortedData = useMemo<TRow[]>(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      const aValue = getNestedValue(a as Record<string, unknown>, sortConfig.key as string);
      const bValue = getNestedValue(b as Record<string, unknown>, sortConfig.key as string);

      if (aValue === null) return 1;
      if (bValue === null) return -1;
      if (aValue === bValue) return 0;

      let comparison = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue < bValue ? -1 : 1;
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else if (aValue instanceof Date && bValue instanceof Date) {
        comparison = aValue.getTime() < bValue.getTime() ? -1 : 1;
      } else {
        const aStr =
          typeof aValue === 'object'
            ? JSON.stringify(aValue)
            : typeof aValue === 'string'
              ? aValue
              : typeof aValue === 'number'
                ? String(aValue)
                : typeof aValue === 'boolean'
                  ? (aValue ? 'true' : 'false')
                  : '';
        const bStr =
          typeof bValue === 'object'
            ? JSON.stringify(bValue)
            : typeof bValue === 'string'
              ? bValue
              : typeof bValue === 'number'
                ? String(bValue)
                : typeof bValue === 'boolean'
                  ? (bValue ? 'true' : 'false')
                  : '';
        comparison = aStr < bStr ? -1 : 1;
      }
      return sortConfig.direction === 'desc' ? comparison * -1 : comparison;
    });
  }, [data, sortConfig]);

  // Filter data
  const filteredData = useMemo<TRow[]>(() => {
    if (!filterText) return sortedData;

    const searchTerm = filterText.toLowerCase();
    return sortedData.filter((row) =>
      columns.some((column) => {
        const value = getNestedValue(row as Record<string, unknown>, column.key);
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.toLowerCase().includes(searchTerm);
        if (typeof value === 'number' || typeof value === 'boolean') return String(value).toLowerCase().includes(searchTerm);
        if (value instanceof Date) return value.toISOString().toLowerCase().includes(searchTerm);
        return JSON.stringify(value).toLowerCase().includes(searchTerm);
      })
    );
  }, [sortedData, filterText, columns]);

  // Paginate data
  const paginatedData = useMemo<TRow[]>(() => {
    if (!pagination) return filteredData;

    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize, pagination]);

  const totalPages = Math.ceil(filteredData.length / pageSize);

  // Handle inline editing
  const startEditing = (rowId: string | number, columnKey: string, currentValue: unknown) => {
    if (!editable) return;
    setEditingCell({ rowId, columnKey });
    const toInputString = (v: unknown): string => {
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      if (v instanceof Date) return v.toISOString();
      return '';
    };
    setEditValue(toInputString(currentValue));
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
      void saveEditing();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  // Render edit input based on editType
  const renderEditInput = (column: TableColumn<TRow>, _currentValue: unknown) => {
    const commonProps = {
      value: editValue,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEditValue(e.target.value),
      onKeyDown: handleKeyDown,
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
  const formatCellValue = (value: unknown, column: TableColumn<TRow>, row: TRow) => {
    if (column.render) {
      return column.render(value, column, row);
    }

    if (value == null) return '-';

    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }

    if (column.type === 'datetime') {
      if (typeof value !== 'string' && !(value instanceof Date)) return '-';
      const dateVal = value instanceof Date ? value : new Date(value);
      if (isNaN(dateVal.getTime())) return '-';
      return dateVal.toLocaleString();
    }

    if (column.type === 'date') {
      if (typeof value !== 'string' && !(value instanceof Date)) return '-';
      const dateVal = value instanceof Date ? value : new Date(value);
      if (isNaN(dateVal.getTime())) return '-';
      return dateVal.toLocaleDateString();
    }

    if (column.type === 'currency') {
      const num = Number(value);
      if (isNaN(num)) return '-';
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: column.currency ?? 'USD',
      }).format(num);
    }

    if (column.type === 'number') {
      const num = Number(value);
      if (isNaN(num)) return '-';
      return num.toLocaleString(undefined, { 
        minimumFractionDigits: column.decimals ?? 0, 
        maximumFractionDigits: column.decimals ?? 0 
      });
    }

    return (value as string | number | bigint | boolean | symbol).toString();
  };

  // Render action buttons
  const renderActions = (row: TRow) => {
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
                const rowId = row.id;
                if (rowId !== undefined) void onDelete(rowId);
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
                void onRecalc(row);
              }}
              className={`text-gray-600 hover:text-gray-900 ${row.id !== undefined && busyRowIds?.has(row.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={row.id !== undefined && busyRowIds?.has(row.id)}
              title="Refresh"
              data-testid="datatable-recalc-button"
            >
              {row.id !== undefined && busyRowIds?.has(row.id) ? (
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
              {(() => {
                if (typeof error === 'string') return error;
                if (error && typeof error === 'object' && 'message' in (error as Record<string, unknown>)) {
                  const err = error as { message?: unknown };
                  return typeof err.message === 'string' ? err.message : JSON.stringify(err.message ?? '');
                }
                return 'An error occurred';
              })()}
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
              {selectableRows && (
                <th className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={
                      paginatedData.length > 0 &&
                      paginatedData.every((r) => {
                        const id = r.id;
                        return id !== undefined && selectedIds.has(id);
                      })
                    }
                    onChange={(e) =>
                      onToggleAll?.(
                        e.target.checked,
                        paginatedData
                          .map((r) => r.id)
                          .filter((id): id is string | number => Boolean(id) && (typeof id === 'string' || typeof id === 'number'))
                      )
                    }
                  />
                </th>
              )}
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
                  colSpan={columns.length + (actions.length > 0 ? 1 : 0) + (selectableRows ? 1 : 0)}
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
                  colSpan={columns.length + (actions.length > 0 ? 1 : 0) + (selectableRows ? 1 : 0)}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <tr
                  key={row.id ?? rowIndex}
                  className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectableRows && (
                    <td className="px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Select row ${String(row.id)}`}
                        checked={Boolean(row.id !== undefined && selectedIds.has(row.id))}
                        onChange={(e) => {
                          const id = row.id;
                          if (id !== undefined) onToggleRow?.(id, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  )}
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
                        onClick={() => {
                          if (isEditable && !isEditing) {
                            const id = row.id;
                            if (id !== undefined) startEditing(id, column.key, cellValue);
                          }
                        }}
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
