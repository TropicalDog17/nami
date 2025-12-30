import { useState, useEffect, FormEvent, ChangeEvent, KeyboardEvent, FC } from 'react'

import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import ComboBox from '../ui/ComboBox'
import DateInput from '../ui/DateInput'

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
    <div className="space-y-2">
      <Label htmlFor={field} className={errors[field] ? 'text-destructive' : ''}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {options ? (
        <Select
          value={(formData[field as keyof FormDataType] as string) ?? ''}
          onValueChange={(value) => handleInputChange(field as keyof FormDataType, value)}
        >
          <SelectTrigger id={field} className={errors[field] ? 'border-destructive' : ''}>
            <SelectValue placeholder={`Select ${label}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={field}
          type={type}
          value={(formData[field as keyof FormDataType] as string) ?? ''}
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange(field as keyof FormDataType, e.target.value)}
          className={errors[field] ? 'border-destructive' : ''}
          {...props}
        />
      )}
      {errors[field] && (
        <p className="text-sm text-destructive">{errors[field]}</p>
      )}
    </div>
  )

  return (
    <div className="bg-card shadow-lg rounded-lg p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="border-b border-border pb-4">
          <h3 className="text-lg font-medium text-foreground">
            {transaction ? 'Edit Transaction' : 'New Transaction'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Fill in the transaction details. Required fields are marked with *.
          </p>
        </div>

        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="date" className={errors.date ? 'text-destructive' : ''}>
              Date<span className="text-destructive ml-1">*</span>
            </Label>
            <DateInput
              id="date"
              value={formData.date}
              onChange={(v: string) => handleInputChange('date', v)}
            />
            {errors.date && (
              <p className="text-sm text-destructive">{errors.date}</p>
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
          <div className="space-y-2">
            <Label htmlFor="account" className={errors.account ? 'text-destructive' : ''}>
              Account<span className="text-destructive ml-1">*</span>
            </Label>
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
              <p className="text-sm text-destructive">{errors.account}</p>
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
        <div className="border-t border-border pt-4">
          <h4 className="text-md font-medium text-foreground mb-4">Amount Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className={errors.quantity ? 'text-destructive' : ''}>
                Quantity<span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                value={quantityDraft !== '' ? quantityDraft : String(formData.quantity ?? '')}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setQuantityDraft(e.target.value)}
                onBlur={() => { if (quantityDraft !== '') { handleInputChange('quantity', normalizeNum(quantityDraft)); setQuantityDraft('') } }}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); if (quantityDraft !== '') { handleInputChange('quantity', normalizeNum(quantityDraft)); setQuantityDraft('') } } }}
                placeholder="0.00000000"
                className={errors.quantity ? 'border-destructive' : ''}
              />
              {errors.quantity && (
                <p className="text-sm text-destructive">{errors.quantity}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className={errors.price_local ? 'text-destructive' : ''}>
                Price (Local Currency)<span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                value={priceLocalDraft !== '' ? priceLocalDraft : String(formData.price_local ?? '')}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPriceLocalDraft(e.target.value)}
                onBlur={() => { if (priceLocalDraft !== '') { handleInputChange('price_local', normalizeNum(priceLocalDraft)); setPriceLocalDraft('') } }}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); if (priceLocalDraft !== '') { handleInputChange('price_local', normalizeNum(priceLocalDraft)); setPriceLocalDraft('') } } }}
                placeholder="0.00000000"
                className={errors.price_local ? 'border-destructive' : ''}
              />
              {errors.price_local && (
                <p className="text-sm text-destructive">{errors.price_local}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Amount (Local)</Label>
              <Input
                type="number"
                step="any"
                readOnly
                value={Number.isFinite(amountLocalNum) ? amountLocalNum.toFixed(8) : ''}
                placeholder="Auto-calculated"
                className="bg-muted"
              />
            </div>
          </div>
        </div>

        {/* Internal Flow Flag */}
        <div className="border-t border-border pt-4">
          <h4 className="text-md font-medium text-foreground mb-4">Advanced</h4>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="internal_flow"
              checked={formData.internal_flow}
              onCheckedChange={(checked) => handleInputChange('internal_flow', Boolean(checked))}
            />
            <Label htmlFor="internal_flow" className="cursor-pointer">
              Treat as internal P2P trade (zero cash flow for Buy/Sell)
            </Label>
          </div>
        </div>

        {/* FX Rates */}
        <div className="border-t border-border pt-4">
          <h4 className="text-md font-medium text-foreground mb-4">FX Rates & Dual Currency</h4>
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

            <div className="space-y-2">
              <Label>Amount (USD)</Label>
              <Input
                type="number"
                step="0.01"
                readOnly
                value={Number.isFinite(amountUsdNum) ? amountUsdNum.toFixed(2) : ''}
                placeholder="Auto-calculated"
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label>Amount (VND)</Label>
              <Input
                type="number"
                step="0.01"
                readOnly
                value={Number.isFinite(amountVndNum) ? amountVndNum.toFixed(2) : ''}
                placeholder="Auto-calculated"
                className="bg-muted"
              />
            </div>
          </div>
        </div>

        {/* Fees */}
        <div className="border-t border-border pt-4">
          <h4 className="text-md font-medium text-foreground mb-4">Fees</h4>
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
        <div className="border-t border-border pt-4">
          <h4 className="text-md font-medium text-foreground mb-4">Optional Tracking</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InputField
              label="Horizon"
              field="horizon"
              options={[
                { value: 'short-term', label: 'Short-term' },
                { value: 'long-term', label: 'Long-term' }
              ]}
            />

            <div className="space-y-2">
              <Label htmlFor="entry_date">Entry Date</Label>
              <DateInput id="entry_date" value={formData.entry_date} onChange={(v: string) => handleInputChange('entry_date', v)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exit_date">Exit Date</Label>
              <DateInput id="exit_date" value={formData.exit_date} onChange={(v: string) => handleInputChange('exit_date', v)} />
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="border-t border-border pt-4">
          <InputField
            label="Note"
            field="note"
            placeholder="Additional notes or description"
          />
        </div>

        {/* Action Buttons */}
        <div className="border-t border-border pt-4 flex justify-end space-x-3">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}

          <Button type="submit">
            {transaction ? 'Update Transaction' : 'Create Transaction'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default TransactionForm
