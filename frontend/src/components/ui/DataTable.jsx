import React, { useState, useMemo } from 'react'

const DataTable = ({ 
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
  masterData = {}
}) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [filterText, setFilterText] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [editingCell, setEditingCell] = useState(null) // { rowId, columnKey }
  const [editValue, setEditValue] = useState('')

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data

    return [...data].sort((a, b) => {
      const aValue = getNestedValue(a, sortConfig.key)
      const bValue = getNestedValue(b, sortConfig.key)

      if (aValue === null) return 1
      if (bValue === null) return -1
      if (aValue === bValue) return 0

      const comparison = aValue < bValue ? -1 : 1
      return sortConfig.direction === 'desc' ? comparison * -1 : comparison
    })
  }, [data, sortConfig])

  // Filter data
  const filteredData = useMemo(() => {
    if (!filterText) return sortedData

    const searchTerm = filterText.toLowerCase()
    return sortedData.filter(row =>
      columns.some(column => {
        const value = getNestedValue(row, column.key)
        return value && value.toString().toLowerCase().includes(searchTerm)
      })
    )
  }, [sortedData, filterText, columns])

  // Paginate data
  const paginatedData = useMemo(() => {
    if (!pagination) return filteredData

    const startIndex = (currentPage - 1) * pageSize
    return filteredData.slice(startIndex, startIndex + pageSize)
  }, [filteredData, currentPage, pageSize, pagination])

  const totalPages = Math.ceil(filteredData.length / pageSize)

  // Helper function to get nested object values
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  // Handle sorting
  const handleSort = (key) => {
    if (!sortable) return

    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  // Format cell value
  const formatCellValue = (value, column) => {
    if (value === null || value === undefined) return '-'
    
    if (column.formatter) {
      return column.formatter(value)
    }
    
    if (column.type === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: column.currency || 'USD',
        minimumFractionDigits: 2,
      }).format(value)
    }
    
    if (column.type === 'number') {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: column.decimals || 0,
        maximumFractionDigits: column.decimals || 8,
      }).format(value)
    }
    
    if (column.type === 'date') {
      return new Date(value).toLocaleDateString()
    }
    
    if (column.type === 'datetime') {
      return new Date(value).toLocaleString()
    }
    
    return value.toString()
  }

  // Handle inline editing
  const startEdit = (rowId, columnKey, currentValue) => {
    if (!editable || !onCellEdit) return
    setEditingCell({ rowId, columnKey })
    setEditValue(currentValue || '')
  }

  const saveEdit = async () => {
    if (!editingCell || !onCellEdit) return

    try {
      await onCellEdit(editingCell.rowId, editingCell.columnKey, editValue)
      setEditingCell(null)
      setEditValue('')
    } catch (error) {
      console.error('Failed to save edit:', error)
      // Could add error handling here
    }
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setEditValue('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  // Check if column is editable
  const isColumnEditable = (column) => {
    return editable && column.editable !== false
  }

  // Render edit input based on column type
  const renderEditInput = (column, value) => {
    const commonProps = {
      value: editValue,
      onChange: (e) => setEditValue(e.target.value),
      onKeyDown: handleKeyDown,
      onBlur: saveEdit,
      autoFocus: true,
      className: "w-full px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
    }

    if (column.editType === 'select' && masterData[column.key]) {
      return (
        <select
          value={editValue}
          onChange={(e) => {
            const newValue = e.target.value
            setEditValue(newValue)
            // Use callback-based saveEdit to ensure we use the latest value
            setTimeout(() => {
              if (editingCell && onCellEdit) {
                onCellEdit(editingCell.rowId, editingCell.columnKey, newValue)
                  .then(() => {
                    setEditingCell(null)
                    setEditValue('')
                  })
                  .catch(error => {
                    console.error('Failed to save edit:', error)
                  })
              }
            }, 100)
          }}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            // Prevent onBlur from interfering with onChange
            e.preventDefault()
          }}
          autoFocus={true}
          className="w-full px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select...</option>
          {masterData[column.key].map(option => (
            <option key={option.value || option.name} value={option.value || option.name}>
              {option.label || option.name}
            </option>
          ))}
        </select>
      )
    }

    if (column.type === 'number' || column.editType === 'number') {
      return <input {...commonProps} type="number" step="any" />
    }

    if (column.type === 'date' || column.editType === 'date') {
      return <input {...commonProps} type="date" />
    }

    return <input {...commonProps} type="text" />
  }

  // Get sort icon
  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }

    return sortConfig.direction === 'asc' ? (
      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
      </svg>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading data</h3>
            <div className="mt-2 text-sm text-red-700">
              {error.message || error}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white shadow-sm rounded-lg overflow-hidden ${className}`}>
      {/* Filter */}
      {filterable && (
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => handleSort(column.key)}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.title}</span>
                    {sortable && getSortIcon(column.key)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center">
                  <div className="flex justify-center items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-gray-500">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <tr
                  key={row.id || rowIndex}
                  className={`group ${
                    onRowClick && !editable ? 'cursor-pointer hover:bg-gray-50' : ''
                  }`}
                >
                  {columns.map((column) => {
                    const cellValue = getNestedValue(row, column.key)
                    const isEditing = editingCell && editingCell.rowId === row.id && editingCell.columnKey === column.key
                    const isEditableColumn = isColumnEditable(column)
                    
                    return (
                      <td 
                        key={column.key} 
                        className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${
                          isEditableColumn ? 'cursor-pointer hover:bg-blue-50' : ''
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isEditableColumn && !isEditing) {
                            startEdit(row.id, column.key, cellValue)
                          } else if (onRowClick && !editable) {
                            onRowClick(row)
                          }
                        }}
                        title={isEditableColumn ? 'Click to edit' : ''}
                      >
                        {isEditing ? (
                          <div className="min-w-32">
                            {renderEditInput(column, cellValue)}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span>{formatCellValue(cellValue, column)}</span>
                            {isEditableColumn && (
                              <svg 
                                className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 ml-2" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
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
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
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
                  <span className="font-medium">
                    {(currentPage - 1) * pageSize + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * pageSize, filteredData.length)}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium">{filteredData.length}</span>{' '}
                  results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    
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
                    )
                  })}
                  
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DataTable
