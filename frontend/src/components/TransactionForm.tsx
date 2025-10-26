import React, { useState, useEffect } from 'react'

import ComboBox from './ui/ComboBox'
import DateInput from './ui/DateInput'
import { useApp } from '../context/AppContext'

const TransactionForm = ({ transaction = null, onSubmit, onCancel }) => {
  const { transactionTypes, accounts, assets, tags, currency, actions } = useApp()

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: '',
    asset: '',
    account: '',
    counterparty: '',
    tag: '',
    note: '',
    quantity: '',
    price_local: '',
    amount_local: '',
    fx_to_usd: '1.0',
    fx_to_vnd: '24000.0',
    amount_usd: '',
    amount_vnd: '',
    fee_usd: '0',
    fee_vnd: '0',
    horizon: '',
    entry_date: '',
    exit_date: '',
    internal_flow: false,
  })

  const [errors, setErrors] = useState({})
  const [isCalculating, setIsCalculating] = useState(false)

  // Load transaction data for editing
  useEffect(() => {
    if (transaction) {
      setFormData({
        date: transaction.date ? new Date(transaction.date).toISOString().split('T')[0] : '',
        type: transaction.type || '',
        asset: transaction.asset || '',
        account: transaction.account || '',
        counterparty: transaction.counterparty || '',
        tag: transaction.tag || '',
        note: transaction.note || '',
        quantity: transaction.quantity || '',
        price_local: transaction.price_local || '',
        amount_local: transaction.amount_local || '',
        fx_to_usd: transaction.fx_to_usd || '1.0',
        fx_to_vnd: transaction.fx_to_vnd || '24000.0',
        amount_usd: transaction.amount_usd || '',
        amount_vnd: transaction.amount_vnd || '',
        fee_usd: transaction.fee_usd || '0',
        fee_vnd: transaction.fee_vnd || '0',
        horizon: transaction.horizon || '',
        entry_date: transaction.entry_date ? new Date(transaction.entry_date).toISOString().split('T')[0] : '',
        exit_date: transaction.exit_date ? new Date(transaction.exit_date).toISOString().split('T')[0] : '',
        internal_flow: Boolean(transaction.internal_flow) || false,
      })
    }
  }, [transaction])

  // Calculate derived fields when relevant inputs change
  useEffect(() => {
    calculateDerivedFields()
  }, [formData.quantity, formData.price_local, formData.fx_to_usd, formData.fx_to_vnd])

  const calculateDerivedFields = () => {
    if (!formData.quantity || !formData.price_local) return

    setIsCalculating(true)

    const quantity = parseFloat(formData.quantity) || 0
    const priceLocal = parseFloat(formData.price_local) || 0
    const fxToUsd = parseFloat(formData.fx_to_usd) || 1
    const fxToVnd = parseFloat(formData.fx_to_vnd) || 24000

    const amountLocal = quantity * priceLocal
    const amountUsd = amountLocal * fxToUsd
    const amountVnd = amountLocal * fxToVnd

    setFormData(prev => ({
      ...prev,
      amount_local: amountLocal.toFixed(8),
      amount_usd: amountUsd.toFixed(2),
      amount_vnd: amountVnd.toFixed(2),
    }))

    setIsCalculating(false)
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  const validateForm = () => {
    const newErrors = {}

    // Required fields
    if (!formData.date) newErrors.date = 'Date is required'
    if (!formData.type) newErrors.type = 'Transaction type is required'
    if (!formData.asset) newErrors.asset = 'Asset is required'
    if (!formData.account) newErrors.account = 'Account is required'
    if (!formData.quantity) newErrors.quantity = 'Quantity is required'
    if (!formData.price_local) newErrors.price_local = 'Price is required'

    // Numeric validation
    if (formData.quantity && isNaN(parseFloat(formData.quantity))) {
      newErrors.quantity = 'Quantity must be a number'
    }
    if (formData.price_local && isNaN(parseFloat(formData.price_local))) {
      newErrors.price_local = 'Price must be a number'
    }
    if (formData.fx_to_usd && isNaN(parseFloat(formData.fx_to_usd))) {
      newErrors.fx_to_usd = 'FX rate must be a number'
    }
    if (formData.fx_to_vnd && isNaN(parseFloat(formData.fx_to_vnd))) {
      newErrors.fx_to_vnd = 'FX rate must be a number'
    }

    // Positive number validation
    if (formData.quantity && parseFloat(formData.quantity) <= 0) {
      newErrors.quantity = 'Quantity must be positive'
    }
    if (formData.price_local && parseFloat(formData.price_local) < 0) {
      newErrors.price_local = 'Price must be non-negative'
    }
    if (formData.fx_to_usd && parseFloat(formData.fx_to_usd) <= 0) {
      newErrors.fx_to_usd = 'FX rate must be positive'
    }
    if (formData.fx_to_vnd && parseFloat(formData.fx_to_vnd) <= 0) {
      newErrors.fx_to_vnd = 'FX rate must be positive'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!validateForm()) return

    // Convert form data to proper types
    const toISODateTime = (d) => {
      if (!d) return null
      const s = String(d)
      if (s.includes('T')) return s
      const timePart = new Date().toISOString().split('T')[1]
      return `${s}T${timePart}`
    }

    const transactionData = {
      ...formData,
      // Normalize dates to RFC3339 for backend consistency
      date: toISODateTime(formData.date),
      entry_date: formData.entry_date ? toISODateTime(formData.entry_date) : null,
      exit_date: formData.exit_date ? toISODateTime(formData.exit_date) : null,
      quantity: parseFloat(formData.quantity),
      price_local: parseFloat(formData.price_local),
      amount_local: parseFloat(formData.amount_local),
      fx_to_usd: parseFloat(formData.fx_to_usd),
      fx_to_vnd: parseFloat(formData.fx_to_vnd),
      amount_usd: parseFloat(formData.amount_usd),
      amount_vnd: parseFloat(formData.amount_vnd),
      fee_usd: parseFloat(formData.fee_usd) || 0,
      fee_vnd: parseFloat(formData.fee_vnd) || 0,
      counterparty: formData.counterparty || null,
      tag: formData.tag || null,
      note: formData.note || null,
      horizon: formData.horizon || null,
      internal_flow: !!formData.internal_flow,
    }

    onSubmit(transactionData)
  }

  const InputField = ({ label, field, type = 'text', required = false, options = null, ...props }) => (
    <div>
      <label htmlFor={field} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {options ? (
        <select
          id={field}
          value={formData[field]}
          onChange={(e) => handleInputChange(field, e.target.value)}
          className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors[field] ? 'border-red-300' : 'border-gray-300'
            }`}
          {...props}
        >
          <option value="">Select {label}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={field}
          type={type}
          value={formData[field]}
          onChange={(e) => handleInputChange(field, e.target.value)}
          className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors[field] ? 'border-red-300' : 'border-gray-300'
            }`}
          {...props}
        />
      )}
      {errors[field] && (
        <p className="mt-1 text-sm text-red-600">{errors[field]}</p>
      )}
    </div>
  )

  return (
    <div className="bg-white shadow-lg rounded-lg p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {transaction ? 'Edit Transaction' : 'New Transaction'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Fill in the transaction details. Required fields are marked with *.
          </p>
        </div>

        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
              Date<span className="text-red-500 ml-1">*</span>
            </label>
            <DateInput
              id="date"
              value={formData.date}
              onChange={(v) => handleInputChange('date', v)}
            />
            {errors.date && (
              <p className="mt-1 text-sm text-red-600">{errors.date}</p>
            )}
          </div>

          <InputField
            label="Transaction Type"
            field="type"
            required
            options={transactionTypes.filter(t => t.is_active).map(t => ({
              value: t.name,
              label: `${t.name} - ${t.description || ''}`
            }))}
          />

          <InputField
            label="Asset"
            field="asset"
            required
            options={assets.filter(a => a.is_active).map(a => ({
              value: a.symbol,
              label: `${a.symbol} - ${a.name || ''}`
            }))}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="account" className="block text-sm font-medium text-gray-700 mb-1">
              Account<span className="text-red-500 ml-1">*</span>
            </label>
            <ComboBox
              id="account"
              value={formData.account}
              onChange={(v) => handleInputChange('account', v)}
              options={(accounts || []).filter(a => a.is_active).map(a => ({ value: a.name, label: `${a.name} (${a.type || 'Unknown'})` }))}
              placeholder="Select or type an account"
              allowCreate
              onCreate={async (name) => { await actions.createAccount({ name, type: 'bank', is_active: true }); await actions.loadAccounts(); }}
            />
            {errors.account && (
              <p className="mt-1 text-sm text-red-600">{errors.account}</p>
            )}
          </div>

          <InputField
            label="Counterparty"
            field="counterparty"
            placeholder="e.g., Binance, Starbucks, John Doe"
          />

          <InputField
            label="Tag"
            field="tag"
            options={tags.filter(t => t.is_active).map(t => ({
              value: t.name,
              label: `${t.name} (${t.category || 'General'})`
            }))}
          />
        </div>

        {/* Amount Information */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-md font-medium text-gray-900 mb-4">Amount Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InputField
              label="Quantity"
              field="quantity"
              type="number"
              step="any"
              required
              placeholder="0.00000000"
            />

            <InputField
              label="Price (Local Currency)"
              field="price_local"
              type="number"
              step="any"
              required
              placeholder="0.00000000"
            />

            <InputField
              label="Amount (Local)"
              field="amount_local"
              type="number"
              step="any"
              readOnly
              placeholder="Auto-calculated"
              className="bg-gray-50"
            />
          </div>
        </div>

        {/* Internal Flow Flag */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-md font-medium text-gray-900 mb-4">Advanced</h4>
          <div className="flex items-center">
            <input
              id="internal_flow"
              type="checkbox"
              checked={!!formData.internal_flow}
              onChange={(e) => handleInputChange('internal_flow', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="internal_flow" className="ml-2 block text-sm text-gray-700">
              Treat as internal P2P trade (zero cash flow for Buy/Sell)
            </label>
          </div>
        </div>

        {/* FX Rates */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-md font-medium text-gray-900 mb-4">FX Rates & Dual Currency</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <InputField
              label="FX to USD"
              field="fx_to_usd"
              type="number"
              step="any"
              placeholder="1.0"
            />

            <InputField
              label="FX to VND"
              field="fx_to_vnd"
              type="number"
              step="any"
              placeholder="24000.0"
            />

            <InputField
              label="Amount (USD)"
              field="amount_usd"
              type="number"
              step="0.01"
              readOnly
              placeholder="Auto-calculated"
              className="bg-gray-50"
            />

            <InputField
              label="Amount (VND)"
              field="amount_vnd"
              type="number"
              step="0.01"
              readOnly
              placeholder="Auto-calculated"
              className="bg-gray-50"
            />
          </div>
        </div>

        {/* Fees */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-md font-medium text-gray-900 mb-4">Fees</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField
              label="Fee (USD)"
              field="fee_usd"
              type="number"
              step="0.01"
              placeholder="0.00"
            />

            <InputField
              label="Fee (VND)"
              field="fee_vnd"
              type="number"
              step="0.01"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Optional Fields */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-md font-medium text-gray-900 mb-4">Optional Tracking</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InputField
              label="Horizon"
              field="horizon"
              options={[
                { value: 'short-term', label: 'Short-term' },
                { value: 'long-term', label: 'Long-term' }
              ]}
            />

            <div>
              <label htmlFor="entry_date" className="block text-sm font-medium text-gray-700 mb-1">Entry Date</label>
              <DateInput id="entry_date" value={formData.entry_date} onChange={(v) => handleInputChange('entry_date', v)} />
            </div>

            <div>
              <label htmlFor="exit_date" className="block text-sm font-medium text-gray-700 mb-1">Exit Date</label>
              <DateInput id="exit_date" value={formData.exit_date} onChange={(v) => handleInputChange('exit_date', v)} />
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="border-t border-gray-200 pt-4">
          <InputField
            label="Note"
            field="note"
            placeholder="Additional notes or description"
          />
        </div>

        {/* Action Buttons */}
        <div className="border-t border-gray-200 pt-4 flex justify-end space-x-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            disabled={isCalculating}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCalculating ? 'Calculating...' : transaction ? 'Update Transaction' : 'Create Transaction'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default TransactionForm
