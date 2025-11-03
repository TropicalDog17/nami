import { Component } from 'react'

type ErrorBoundaryState = {
  hasError: boolean
  error: unknown
  errorInfo: React.ErrorInfo | null
}

class ErrorBoundary extends Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(_error: unknown) {
    // Update state so the next render will show the fallback UI
    return { hasError: true }
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error,
      errorInfo
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full">
            <div className="bg-white shadow-lg rounded-lg p-6">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h1 className="text-lg font-medium text-gray-900">
                    Something went wrong
                  </h1>
                </div>
              </div>
              
              <div className="text-sm text-gray-600 mb-4">
                An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
              </div>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mb-4">
                  <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
                    Error Details (Development)
                  </summary>
                  <div className="mt-2 text-xs text-gray-600 bg-gray-100 p-3 rounded font-mono overflow-auto max-h-40">
                    <div className="mb-2">
                      <strong>Error:</strong> {(() => {
                        const e = this.state.error
                        return e instanceof Error ? e.message : 'An unknown error occurred'
                      })()}
                    </div>
                    {this.state.errorInfo && (
                      <div>
                        <strong>Stack:</strong>
                        <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                      </div>
                    )}
                  </div>
                </details>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Refresh Page
                </button>
                <button
                  onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                  className="flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
