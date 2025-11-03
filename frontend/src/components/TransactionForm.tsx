import { useState, useEffect, FormEvent, ChangeEvent, KeyboardEvent, FC } from 'react'

import ComboBox from './ui/ComboBox'
import DateInput from './ui/DateInput'
import { useApp } from '../context/AppContext'

interface Transaction {
  id?: string;
  date: string;
  type: string;
  asset: string;
  account: string;
  counterparty?: string;
  tag?: string;
  note?: string;
  quantity: string;
  price_local: string;
  amount_local: string;
  fx_to_usd: string;
  fx_to_vnd: string;
  amount_usd: string;
  amount_vnd: string;
  fee_usd: string;
  fee_vnd: string;
  horizon?: string;
  entry_date?: string;
  exit_date?: string;
  internal_flow?: boolean;
}

interface Props {
  transaction?: Transaction | null;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel?: () => void;
}

interface FormDataType {
  date: string;
  type: string;
  asset: string;
  account: string;
  counterparty: string;
  tag: string;
  note: string;
  quantity: string;
  price_local: string;
  amount_local: string;
  fx_to_usd: string;
  fx_to_vnd: string;
  amount_usd: string;
  amount_vnd: string;
  fee_usd: string;
  fee_vnd: string;
  horizon: string;
  entry_date: string;
  exit_date: string;
  internal_flow: boolean;
}

interface InputFieldProps {
  label: string;
  field: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[] | null;
  placeholder?: string;
  step?: string;
}

const TransactionForm = ({ transaction = null, onSubmit, onCancel }: Props) => {
  const { transactionTypes, accounts, assets, tags, actions } = useApp()

  const [formData, setFormData] = useState<FormDataType>({
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

  const [errors, setErrors] = useState<Record<string, string | null>>({})
  // Local drafts so typing doesn't commit and trigger re-renders until Enter/blur
  const [quantityDraft, setQuantityDraft] = useState('')
  const [priceLocalDraft, setPriceLocalDraft] = useState('')
  // Derived amounts are computed live instead of stored in state to avoid re-renders stealing focus

  // Load transaction data for editing
  useEffect(() => {
    if (transaction) {
      setFormData({
        date: transaction.date ? new Date(transaction.date).toISOString().split('T')[0] : '',
        type: transaction.type ?? '',
        asset: transaction.asset ?? '',
        account: transaction.account ?? '',
        counterparty: transaction.counterparty ?? '',
        tag: transaction.tag ?? '',
        note: transaction.note ?? '',
        quantity: transaction.quantity ?? '',
        price_local: transaction.price_local ?? '',
        amount_local: transaction.amount_local ?? '',
        fx_to_usd: transaction.fx_to_usd ?? '1.0',
        fx_to_vnd: transaction.fx_to_vnd ?? '24000.0',
        amount_usd: transaction.amount_usd ?? '',
        amount_vnd: transaction.amount_vnd ?? '',
        fee_usd: transaction.fee_usd ?? '0',
        fee_vnd: transaction.fee_vnd ?? '0',
        horizon: transaction.horizon ?? '',
        entry_date: transaction.entry_date ? new Date(transaction.entry_date).toISOString().split('T')[0] : '',
        exit_date: transaction.exit_date ? new Date(transaction.exit_date).toISOString().split('T')[0] : '',
        internal_flow: Boolean(transaction.internal_flow ?? false),
      })
      setQuantityDraft(String(transaction.quantity ?? ''))
      setPriceLocalDraft(String(transaction.price_local ?? ''))
    }
  }, [transaction])

  const normalizeNum = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, '').replace(/,/g, '.')
  const effectiveQtyStr = quantityDraft !== '' ? quantityDraft : String(formData.quantity ?? '')
  const effectivePriceStr = priceLocalDraft !== '' ? priceLocalDraft : String(formData.price_local ?? '')
  const qtyNum = parseFloat(normalizeNum(effectiveQtyStr)) || 0
  const priceLocalNum = parseFloat(normalizeNum(effectivePriceStr)) || 0
  const fxUsdNum = parseFloat(formData.fx_to_usd ?? '1') || 1
  const fxVndNum = parseFloat(formData.fx_to_vnd ?? '24000') || 24000
  const amountLocalNum = qtyNum * priceLocalNum
  const amountUsdNum = amountLocalNum * fxUsdNum
  const amountVndNum = amountLocalNum * fxVndNum

  const handleInputChange = (field: keyof FormDataType, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }))

    // Clear error when user starts typing
    if ((errors[field])) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string | null> = {}

    // Required fields
    if (!formData.date) newErrors.date = 'Date is required'
    if (!formData.type) newErrors.type = 'Transaction type is required'
    if (!formData.asset) newErrors.asset = 'Asset is required'
    if (!formData.account) newErrors.account = 'Account is required'
    if (!effectiveQtyStr) newErrors.quantity = 'Quantity is required'
    if (!effectivePriceStr) newErrors.price_local = 'Price is required'

    // Numeric validation
    if (effectiveQtyStr && isNaN(parseFloat(normalizeNum(effectiveQtyStr)))) {
      newErrors.quantity = 'Quantity must be a number'
    }
    if (effectivePriceStr && isNaN(parseFloat(normalizeNum(effectivePriceStr)))) {
      newErrors.price_local = 'Price must be a number'
    }
    if (formData.fx_to_usd && isNaN(parseFloat(formData.fx_to_usd))) {
      newErrors.fx_to_usd = 'FX rate must be a number'
    }
    if (formData.fx_to_vnd && isNaN(parseFloat(formData.fx_to_vnd))) {
      newErrors.fx_to_vnd = 'FX rate must be a number'
    }

    // Positive number validation
    if (effectiveQtyStr && parseFloat(normalizeNum(effectiveQtyStr)) <= 0) {
      newErrors.quantity = 'Quantity must be positive'
    }
    if (effectivePriceStr && parseFloat(normalizeNum(effectivePriceStr)) < 0) {
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

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!validateForm()) return

    // Convert form data to proper types
    const toISODateTime = (d: string | null): string | null => {
      if (!d) return null
      const s = String(d)
      if (s.includes('T')) return s
      const timePart = new Date().toISOString().split('T')[1]
      return `${s}T${timePart}`
    }

    const transactionData = {
      ...formData,
      // Normalize dates to RFC3339 for backend consistency
      date: toISODateTime(formData.date ?? ''),
      entry_date: formData.entry_date ? toISODateTime(formData.entry_date) : null,
      exit_date: formData.exit_date ? toISODateTime(formData.exit_date) : null,
      quantity: parseFloat(normalizeNum(effectiveQtyStr ?? '')),
      price_local: parseFloat(normalizeNum(effectivePriceStr ?? '')),
      amount_local: amountLocalNum,
      fx_to_usd: parseFloat(formData.fx_to_usd ?? '1'),
      fx_to_vnd: parseFloat(formData.fx_to_vnd ?? '24000'),
      amount_usd: amountUsdNum,
      amount_vnd: amountVndNum,
      fee_usd: parseFloat(formData.fee_usd ?? '0') || 0,
      fee_vnd: parseFloat(formData.fee_vnd ?? '0') || 0,
      counterparty: formData.counterparty ?? null,
      tag: formData.tag ?? null,
      note: formData.note ?? null,
      horizon: formData.horizon ?? null,
      internal_flow: !!formData.internal_flow,
    }

    onSubmit(transactionData)
  }

  const InputField: FC<InputFieldProps> = ({
    label,
    field,
    type = 'text',
    required = false,
    options = null,
    ...props
  }) => (
    <div>
      <label htmlFor={field} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {options ? (
        <select
          id={field}
          value={(formData[field as keyof FormDataType] as string) ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => handleInputChange(field as keyof FormDataType, e.target.value)}
          className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            errors[field] ? 'border-red-300' : 'border-gray-300'
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
          value={(formData[field as keyof FormDataType] as string) ?? ''}
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange(field as keyof FormDataType, e.target.value)}
          className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            errors[field] ? 'border-red-300' : 'border-gray-300'
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
              onChange={(v: string) => handleInputChange('date', v)}
            />
            {errors.date && (
              <p className="mt-1 text-sm text-red-600">{errors.date}</p>
            )}
          </div>

          <InputField
            label="Transaction Type"
            field="type"
            required
            options={transactionTypes.filter((t: unknown) => (t as { is_active: boolean }).is_active).map((t: unknown) => {
              const typedT = t as { name: string; description?: string };
              return {
                value: typedT.name,
                label: `${typedT.name} - ${typedT.description ?? ''}`
              }
            })}
          />

          <InputField
            label="Asset"
            field="asset"
            required
            options={assets.filter((a: unknown) => (a as { is_active: boolean }).is_active).map((a: unknown) => {
              const typedA = a as { symbol: string; name?: string };
              return {
                value: typedA.symbol,
                label: `${typedA.symbol} - ${typedA.name ?? ''}`
              }
            })}
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
              onChange={(v: string) => handleInputChange('account', v)}
              options={(accounts ?? []).filter((a: unknown) => (a as { is_active: boolean }).is_active).map((a: unknown) => { 
                const typedA = a as { name: string; type?: string };
                return { 
                  value: typedA.name, 
                  label: `${typedA.name} (${typedA.type ?? 'Unknown'})` 
                } 
              })}
              placeholder="Select or type an account"
              allowCreate
              onCreate={async (name: string) => { 
                await actions.createAccount({ name, type: 'bank', is_active: true }); 
                await actions.loadAccounts(); 
              }}
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
            options={tags.filter((t: unknown) => (t as { is_active: boolean }).is_active).map((t: unknown) => {
              const typedT = t as { name: string; category?: string };
              return {
                value: typedT.name,
                label: `${typedT.name} (${typedT.category ?? 'General'})`
              }
            })}
          />
        </div>

        {/* Amount Information */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-md font-medium text-gray-900 mb-4">Amount Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity<span className="text-red-500 ml-1">*</span></label>
              <input
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                value={quantityDraft !== '' ? quantityDraft : String(formData.quantity ?? '')}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setQuantityDraft(e.target.value)}
                onBlur={() => { if (quantityDraft !== '') { handleInputChange('quantity', normalizeNum(quantityDraft)); setQuantityDraft('') } }}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); if (quantityDraft !== '') { handleInputChange('quantity', normalizeNum(quantityDraft)); setQuantityDraft('') } } }}
                placeholder="0.00000000"
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors['quantity'] ? 'border-red-300' : 'border-gray-300'}`}
              />
              {errors['quantity'] && (
                <p className="mt-1 text-sm text-red-600">{errors['quantity']}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price (Local Currency)<span className="text-red-500 ml-1">*</span></label>
              <input
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                value={priceLocalDraft !== '' ? priceLocalDraft : String(formData.price_local ?? '')}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPriceLocalDraft(e.target.value)}
                onBlur={() => { if (priceLocalDraft !== '') { handleInputChange('price_local', normalizeNum(priceLocalDraft)); setPriceLocalDraft('') } }}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); if (priceLocalDraft !== '') { handleInputChange('price_local', normalizeNum(priceLocalDraft)); setPriceLocalDraft('') } } }}
                placeholder="0.00000000"
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors['price_local'] ? 'border-red-300' : 'border-gray-300'}`}
              />
              {errors['price_local'] && (
                <p className="mt-1 text-sm text-red-600">{errors['price_local']}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Local)</label>
              <input
                type="number"
                step="any"
                readOnly
                value={Number.isFinite(amountLocalNum) ? amountLocalNum.toFixed(8) : ''}
                placeholder="Auto-calculated"
                className="w-full px-3 py-2 border rounded-md shadow-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Internal Flow Flag */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-md font-medium text-gray-900 mb-4">Advanced</h4>
          <div className="flex items-center">
            <input
              id="internal_flow"
              type="checkbox"
              checked={formData.internal_flow}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('internal_flow', e.target.checked)}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (USD)</label>
              <input
                type="number"
                step="0.01"
                readOnly
                value={Number.isFinite(amountUsdNum) ? amountUsdNum.toFixed(2) : ''}
                placeholder="Auto-calculated"
                className="w-full px-3 py-2 border rounded-md shadow-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (VND)</label>
              <input
                type="number"
                step="0.01"
                readOnly
                value={Number.isFinite(amountVndNum) ? amountVndNum.toFixed(2) : ''}
                placeholder="Auto-calculated"
                className="w-full px-3 py-2 border rounded-md shadow-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
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
              <DateInput id="entry_date" value={formData.entry_date} onChange={(v: string) => handleInputChange('entry_date', v)} />
            </div>

            <div>
              <label htmlFor="exit_date" className="block text-sm font-medium text-gray-700 mb-1">Exit Date</label>
              <DateInput id="exit_date" value={formData.exit_date} onChange={(v: string) => handleInputChange('exit_date', v)} />
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
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {transaction ? 'Update Transaction' : 'Create Transaction'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default TransactionForm
