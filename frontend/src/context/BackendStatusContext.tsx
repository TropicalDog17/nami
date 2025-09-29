import React, { createContext, useContext, useState, useEffect } from 'react'

import { healthApi } from '../services/api'

const BackendStatusContext = createContext()

export const useBackendStatus = () => {
  const context = useContext(BackendStatusContext)
  if (!context) {
    throw new Error('useBackendStatus must be used within a BackendStatusProvider')
  }
  return context
}

export const BackendStatusProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(true)
  const [lastChecked, setLastChecked] = useState(null)
  const [isChecking, setIsChecking] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const checkBackendHealth = async (showLoading = true) => {
    if (showLoading) {
      setIsChecking(true)
    }
    
    try {
      await healthApi.check()
      setIsOnline(true)
      setRetryCount(0)
      setLastChecked(new Date())
    } catch (error) {
      console.warn('Backend health check failed:', error.message)
      setIsOnline(false)
      setRetryCount(prev => prev + 1)
      setLastChecked(new Date())
    } finally {
      if (showLoading) {
        setIsChecking(false)
      }
    }
  }

  const retryConnection = () => {
    checkBackendHealth(true)
  }

  // Check backend health on mount and periodically
  useEffect(() => {
    checkBackendHealth(false)

    // Check every 30 seconds when online, every 10 seconds when offline
    const interval = setInterval(() => {
      checkBackendHealth(false)
    }, isOnline ? 30000 : 10000)

    return () => clearInterval(interval)
  }, [isOnline])

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => checkBackendHealth(false)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const value = {
    isOnline,
    lastChecked,
    isChecking,
    retryCount,
    checkBackendHealth,
    retryConnection,
  }

  return (
    <BackendStatusContext.Provider value={value}>
      {children}
    </BackendStatusContext.Provider>
  )
}
