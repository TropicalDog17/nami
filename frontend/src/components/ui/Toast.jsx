import React, { useState, useEffect, createContext, useContext } from 'react'

// Toast context
const ToastContext = createContext()

// Toast types
export const ToastTypes = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
}

// Toast provider component
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = (message, type = ToastTypes.INFO, duration = 5000) => {
    const id = Date.now() + Math.random()
    const toast = { id, message, type, duration }
    
    setToasts(prev => [...prev, toast])

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    return id
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const value = {
    toasts,
    addToast,
    removeToast,
    success: (message, duration) => addToast(message, ToastTypes.SUCCESS, duration),
    error: (message, duration) => addToast(message, ToastTypes.ERROR, duration),
    warning: (message, duration) => addToast(message, ToastTypes.WARNING, duration),
    info: (message, duration) => addToast(message, ToastTypes.INFO, duration),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  )
}

// Hook to use toast
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

// Individual toast component
function ToastItem({ toast, onRemove }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    // Animate in
    const timer = setTimeout(() => setIsVisible(true), 10)
    return () => clearTimeout(timer)
  }, [])

  const handleRemove = () => {
    setIsLeaving(true)
    setTimeout(() => onRemove(toast.id), 300)
  }

  const getToastStyles = () => {
    const baseStyles = "flex items-center p-4 mb-3 text-sm rounded-lg shadow-lg transition-all duration-300 transform"
    
    const typeStyles = {
      [ToastTypes.SUCCESS]: "bg-green-50 text-green-800 border border-green-200",
      [ToastTypes.ERROR]: "bg-red-50 text-red-800 border border-red-200",
      [ToastTypes.WARNING]: "bg-yellow-50 text-yellow-800 border border-yellow-200",
      [ToastTypes.INFO]: "bg-blue-50 text-blue-800 border border-blue-200",
    }

    const animationStyles = isLeaving 
      ? "opacity-0 translate-x-full" 
      : isVisible 
        ? "opacity-100 translate-x-0" 
        : "opacity-0 translate-x-full"

    return `${baseStyles} ${typeStyles[toast.type]} ${animationStyles}`
  }

  const getIcon = () => {
    const iconProps = { className: "w-5 h-5 mr-3 flex-shrink-0" }
    
    switch (toast.type) {
      case ToastTypes.SUCCESS:
        return (
          <svg {...iconProps} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )
      case ToastTypes.ERROR:
        return (
          <svg {...iconProps} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )
      case ToastTypes.WARNING:
        return (
          <svg {...iconProps} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )
      case ToastTypes.INFO:
      default:
        return (
          <svg {...iconProps} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )
    }
  }

  return (
    <div className={getToastStyles()}>
      {getIcon()}
      <div className="flex-1 font-medium">
        {toast.message}
      </div>
      <button
        onClick={handleRemove}
        className="ml-3 text-gray-400 hover:text-gray-600 focus:outline-none"
        aria-label="Close"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  )
}

// Main toast container component
function Toast() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full">
      {toasts.map(toast => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={removeToast}
        />
      ))}
    </div>
  )
}

// Wrap the default export with ToastProvider
export default function ToastWithProvider({ children }) {
  return (
    <ToastProvider>
      {children}
      <Toast />
    </ToastProvider>
  )
}
