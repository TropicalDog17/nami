import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'

import Layout from './components/Layout'
import BackendStatus from './components/ui/BackendStatus'
import ErrorBoundary from './components/ui/ErrorBoundary'
import ToastWithProvider from './components/ui/Toast'
import { AppProvider } from './context/AppContext'
import { BackendStatusProvider } from './context/BackendStatusContext'
import AdminPage from './pages/AdminPage'
import CreditDashboardPage from './pages/CreditDashboardPage'
import ReportsPage from './pages/ReportsPage'
import TransactionPage from './pages/TransactionPage'
import VaultDetailPage from './pages/VaultDetailPage'
import VaultsPage from './pages/VaultsPage'

function App() {
  return (
    <ErrorBoundary>
      <BackendStatusProvider>
        <ToastWithProvider>
          <AppProvider>
            <Router>
              <BackendStatus />
              <Layout>
                <Routes>
                  <Route path="/" element={<TransactionPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/credit" element={<CreditDashboardPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/vaults" element={<VaultsPage />} />
                  <Route path="/vault/:vaultName" element={<VaultDetailPage />} />
                </Routes>
              </Layout>
            </Router>
          </AppProvider>
        </ToastWithProvider>
      </BackendStatusProvider>
    </ErrorBoundary>
  )
}

export default App
