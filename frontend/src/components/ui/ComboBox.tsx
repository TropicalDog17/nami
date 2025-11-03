import React, { useEffect, useMemo, useRef, useState } from 'react'

export type ComboBoxOption = {
  value: string
  label: string
}

type ComboBoxProps = {
  id?: string
  value?: string
  onChange?: (value: string) => void
  options: ComboBoxOption[]
  placeholder?: string
  className?: string
  allowCreate?: boolean
  onCreate?: (value: string) => Promise<void> | void
}

const ComboBox: React.FC<ComboBoxProps> = ({
  id,
  value = '',
  onChange,
  options,
  placeholder = 'Select or type...',
  className = '',
  allowCreate = false,
  onCreate,
}) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState<string>(value || '')
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 50)
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)).slice(0, 50)
  }, [options, query])

  const handleSelect = (val: string) => {
    onChange?.(val)
    setQuery(val)
    setOpen(false)
  }

  const handleCreate = async () => {
    if (!allowCreate || !onCreate) return
    const newVal = query.trim()
    if (!newVal) return
    await onCreate(newVal)
    onChange?.(newVal)
    setOpen(false)
  }

  const showCreate = allowCreate && query.trim().length > 0 && !options.some((o) => o.value.toLowerCase() === query.trim().toLowerCase())

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        id={id}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border rounded-md shadow-lg max-h-64 overflow-auto">
          {filtered.length === 0 && !showCreate && (
            <div className="px-3 py-2 text-sm text-gray-500">No results</div>
          )}
          {filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${value === opt.value ? 'bg-blue-50' : ''}`}
            >
              <div className="font-medium">{opt.value}</div>
              <div className="text-xs text-gray-500">{opt.label}</div>
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={() => { void handleCreate(); }}
              className="w-full text-left px-3 py-2 text-sm bg-green-50 hover:bg-green-100 border-t"
            >
              Create {'"'}{query.trim()}{'"'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ComboBox


