import React, { createContext, useContext, useState, useEffect } from 'react'

import { healthApi } from '../services/api'

type BackendStatusContextValue = {
  isOnline: boolean
  lastChecked: Date | null
  isChecking: boolean
  retryCount: number
  checkBackendHealth: (showLoading?: boolean) => Promise<void>
  retryConnection: () => void
}

const BackendStatusContext = createContext<BackendStatusContextValue | undefined>(undefined)

// eslint-disable-next-line react-refresh/only-export-components
export const useBackendStatus = (): BackendStatusContextValue => {
  const context = useContext(BackendStatusContext)
  if (!context) {
    throw new Error('useBackendStatus must be used within a BackendStatusProvider')
  }
  return context
}

export const BackendStatusProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [isChecking, setIsChecking] = useState<boolean>(false)
  const [retryCount, setRetryCount] = useState<number>(0)

  const checkBackendHealth = async (showLoading: boolean = true): Promise<void> => {
    if (showLoading) {
      setIsChecking(true)
    }
    
    try {
      await healthApi.check()
      setIsOnline(true)
      setRetryCount(0)
      setLastChecked(new Date())
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('Backend health check failed:', message)
      setIsOnline(false)
      setRetryCount(prev => prev + 1)
      setLastChecked(new Date())
    } finally {
      if (showLoading) {
        setIsChecking(false)
      }
    }
  }

  const retryConnection = (): void => {
    void checkBackendHealth(true)
  }

  // Check backend health on mount and periodically
  useEffect(() => {
    void checkBackendHealth(false)

    // Check every 30 seconds when online, every 10 seconds when offline
    const interval = setInterval(() => {
      void checkBackendHealth(false)
    }, isOnline ? 30000 : 10000)

    return () => clearInterval(interval)
  }, [isOnline])

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => void checkBackendHealth(false)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const value: BackendStatusContextValue = {
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
