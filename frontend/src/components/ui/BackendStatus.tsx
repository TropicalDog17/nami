import React from 'react'

import { useBackendStatus } from '../../context/BackendStatusContext'

const BackendStatus = () => {
  const { isOnline, lastChecked, isChecking, retryCount, retryConnection } = useBackendStatus()

  if (isOnline) {
    return null // Don't show anything when backend is online
  }

  const formatTime = (date) => {
    if (!date) return 'Never'
    return date.toLocaleTimeString()
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-red-600 text-white px-4 py-2 z-50">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-red-300 rounded-full animate-pulse"></div>
            <span className="font-medium">Backend Offline</span>
          </div>
          <span className="text-red-200 text-sm">
            {isChecking ? 'Checking...' : `Last checked: ${formatTime(lastChecked)}`}
          </span>
          {retryCount > 0 && (
            <span className="text-red-200 text-sm">
              (Retry #{retryCount})
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-3">
          <span className="text-red-200 text-sm hidden sm:block">
            Some features may not work properly
          </span>
          <button
            onClick={retryConnection}
            disabled={isChecking}
            className="bg-red-700 hover:bg-red-800 disabled:opacity-50 px-3 py-1 rounded text-sm font-medium transition-colors"
          >
            {isChecking ? 'Checking...' : 'Retry'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BackendStatus
