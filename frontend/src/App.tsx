import { Agentation } from 'agentation';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Layout from './components/Layout';
import BackendStatus from './components/ui/BackendStatus';
import ErrorBoundary from './components/ui/ErrorBoundary';
import ToastWithProvider from './components/ui/Toast';
import { AppProvider } from './context/AppContext';
	import { BackendStatusProvider } from './context/BackendStatusContext';
	import AdminPage from './pages/AdminPage';
	import AIAdvisorPage from './pages/AIAdvisorPage';
	import BorrowingsPage from './pages/BorrowingsPage';
	import ReportsPage from './pages/ReportsPage';
	import TransactionPage from './pages/TransactionPage';
	import VaultDetailPage from './pages/VaultDetailPage';
	import VaultsPage from './pages/VaultsPage';

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
	                                    <Route
	                                        path="/"
	                                        element={<TransactionPage />}
	                                    />
	                                    <Route
	                                        path="/cashflow"
	                                        element={
	                                            <ReportsPage
	                                                initialTab="cashflow"
	                                                visibleTabs={['cashflow']}
	                                                pageTitle="Cash Flow"
	                                                pageDescription="Cash flow analysis and forecast."
	                                            />
	                                        }
	                                    />
	                                    <Route
	                                        path="/spending"
	                                        element={
	                                            <ReportsPage
	                                                initialTab="spending"
	                                                visibleTabs={['spending']}
	                                                pageTitle="Spending"
	                                                pageDescription="Spending insights and trends."
	                                            />
	                                        }
	                                    />
	                                    <Route
	                                        path="/admin"
	                                        element={<AdminPage />}
	                                    />
	                                    <Route
	                                        path="/vaults"
	                                        element={<VaultsPage />}
	                                    />
                                    <Route
                                        path="/borrowings"
                                        element={<BorrowingsPage />}
                                    />
                                    <Route
                                        path="/vault/:vaultId"
                                        element={<VaultDetailPage />}
                                    />
                                    <Route
                                        path="/ai-advisor"
                                        element={<AIAdvisorPage />}
                                    />
                                </Routes>
                            </Layout>
                        </Router>
                        {import.meta.env.DEV && <Agentation />}
                    </AppProvider>
                </ToastWithProvider>
            </BackendStatusProvider>
        </ErrorBoundary>
    );
}

export default App;
