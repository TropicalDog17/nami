import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { BackendStatusProvider } from './context/BackendStatusContext'
import Layout from './components/Layout'
import TransactionPage from './pages/TransactionPage'
import AdminPage from './pages/AdminPage'
import ReportsPage from './pages/ReportsPage'
import ErrorBoundary from './components/ui/ErrorBoundary'
import Toast from './components/ui/Toast'
import BackendStatus from './components/ui/BackendStatus'

function App() {
  return (
    <ErrorBoundary>
      <BackendStatusProvider>
        <AppProvider>
          <Router>
            <BackendStatus />
            <Layout>
              <Routes>
                <Route path="/" element={<TransactionPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/reports" element={<ReportsPage />} />
              </Routes>
            </Layout>
            <Toast />
          </Router>
        </AppProvider>
      </BackendStatusProvider>
    </ErrorBoundary>
  )
}

export default App
