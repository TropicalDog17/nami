# Frontend Structure

## Purpose
The frontend is a React-based single-page application that provides the user interface for transaction tracking, financial management, and investment monitoring. It offers an intuitive dashboard for viewing financial data, managing transactions, and accessing reports.

## Architecture Overview
The frontend follows modern React patterns with functional components and hooks:
- **Component Architecture**: Hierarchical component structure with separation of concerns
- **State Management**: React Context for global state and local state for component-specific data
- **Routing**: React Router for navigation between pages
- **API Integration**: Centralized API service layer with error handling
- **UI Library**: Custom component library with consistent design patterns

## Folder Structure

```
frontend/
├── src/                     # Source code
│   ├── main.tsx            # Application entry point
│   ├── App.tsx             # Main app component with routing
│   ├── pages/              # Page-level components
│   │   ├── AdminPage.tsx   # Administrative interface
│   │   ├── CreditDashboardPage.tsx # Credit card dashboard
│   │   ├── ReportsPage.tsx # Financial reports
│   │   ├── TransactionPage.tsx # Transaction management
│   │   ├── VaultDetailPage.tsx # Vault detail view
│   │   └── VaultsPage.tsx  # Vault management
│   ├── components/         # Reusable UI components
│   │   ├── Layout.tsx      # Main application layout
│   │   ├── forms/          # Form components
│   │   │   ├── AssetFormAdvanced.tsx # Complex asset form
│   │   │   └── TransactionForm.tsx # Transaction entry form
│   │   ├── modals/         # Modal dialogs
│   │   │   ├── QuickExpenseModal.tsx # Quick expense entry
│   │   │   ├── QuickIncomeModal.tsx # Quick income entry
│   │   │   ├── QuickInitBalanceModal.tsx # Initial balance
│   │   │   ├── QuickInvestmentModal.tsx # Quick investment
│   │   │   └── QuickVaultModal.tsx # Quick vault operation
│   │   ├── reports/        # Reporting components
│   │   │   ├── AssetAllocationChart.tsx # Asset allocation
│   │   │   ├── CashFlowChart.tsx # Cash flow visualization
│   │   │   ├── Charts.tsx  # Generic chart components
│   │   │   └── PnLDisplay.tsx # P&L display component
│   │   ├── ui/             # Basic UI components
│   │   │   ├── BackendStatus.tsx # Backend connectivity status
│   │   │   ├── ComboBox.tsx # Dropdown/combobox component
│   │   │   ├── DataTable.tsx # Data table component
│   │   │   ├── DateInput.tsx # Date picker input
│   │   │   ├── ErrorBoundary.tsx # Error boundary component
│   │   │   └── Toast.tsx   # Notification toast component
│   │   ├── AdminAssetsTab.tsx # Admin asset management
│   │   ├── CreditCardSummary.tsx # Credit card summary
│   │   ├── FloatingAddButton.tsx # Floating action button
│   │   ├── QuickExpenseModal.tsx # Quick expense modal
│   │   ├── QuickIncomeModal.tsx # Quick income modal
│   │   ├── QuickInitBalanceModal.tsx # Quick init balance modal
│   │   ├── QuickInvestmentModal.tsx # Quick investment modal
│   │   ├── QuickVaultModal.tsx # Quick vault modal
│   │   ├── TransactionForm.tsx # Transaction form
│   │   └── VaultManager.tsx # Vault management component
│   ├── context/            # React Context providers
│   │   ├── AppContext.tsx  # Global application state
│   │   └── BackendStatusContext.tsx # Backend connectivity
│   ├── hooks/              # Custom React hooks
│   │   ├── useQuickCreate.ts # Quick action creation hook
│   │   └── useQuickExpense.ts # Quick expense hook
│   ├── services/           # API integration layer
│   │   └── api.ts          # API client and service functions
│   ├── styles/             # CSS/styling files
│   └── utils/              # Utility functions
├── tests/                  # Test files
│   ├── components/         # Component tests
│   ├── e2e/               # End-to-end tests
│   └── utils/             # Test utilities
├── dist/                  # Built application output
└── Configuration files    # package.json, vite.config.ts, etc.
```

## Component Inventory

### Page Components

**App.tsx** - Main application component with routing setup and global layout structure.

**AdminPage.tsx** - Administrative interface for managing system assets, users, and configuration.

**CreditDashboardPage.tsx** - Credit card dashboard showing spending, balances, and credit utilization.

**ReportsPage.tsx** - Financial reporting interface with charts, P&L, and asset allocation views.

**TransactionPage.tsx** - Transaction management interface for viewing, adding, and editing transactions.

**VaultDetailPage.tsx** - Detailed view of individual vault with holdings, performance, and operations.

**VaultsPage.tsx** - Vault management overview showing all vaults and their statuses.

### Core Components

**Layout.tsx** - Main application layout component with navigation, header, and content areas.

**FloatingAddButton.tsx** - Floating action button for quick access to common operations.

**VaultManager.tsx** - Vault management component for creating, updating, and monitoring vaults.

### Form Components

**forms/AssetFormAdvanced.tsx** - Complex form for managing asset configurations with validation and advanced options.

**forms/TransactionForm.tsx** - Comprehensive transaction entry form with category selection, date picker, and validation.

### Modal Components

**modals/QuickExpenseModal.tsx** - Modal for quick expense entry with simplified interface and auto-categorization.

**modals/QuickIncomeModal.tsx** - Modal for quick income entry with source selection and amount validation.

**modals/QuickInitBalanceModal.tsx** - Modal for setting initial account balances during setup.

**modals/QuickInvestmentModal.tsx** - Modal for quick investment entry with asset selection and amount.

**modals/QuickVaultModal.tsx** - Modal for quick vault operations like deposits and withdrawals.

### Reporting Components

**reports/AssetAllocationChart.tsx** - Chart component for visualizing asset allocation across different categories.

**reports/CashFlowChart.tsx** - Cash flow visualization showing income, expenses, and net cash position over time.

**reports/Charts.tsx** - Generic chart components and utilities for data visualization.

**reports/PnLDisplay.tsx** - Profit and loss display component with breakdown by category and period.

### UI Components

**ui/BackendStatus.tsx** - Component for displaying backend connectivity status and health information.

**ui/ComboBox.tsx** - Custom combobox/dropdown component with search and selection capabilities.

**ui/DataTable.tsx** - Sortable, filterable data table component with pagination.

**ui/DateInput.tsx** - Date picker input component with calendar interface and validation.

**ui/ErrorBoundary.tsx** - React error boundary component for catching and displaying errors gracefully.

**ui/Toast.tsx** - Notification toast component for displaying success, error, and info messages.

### Context Providers

**context/AppContext.tsx** - Global application context providing shared state and functions across components.

**context/BackendStatusContext.tsx** - Context for managing and sharing backend connectivity status.

### Custom Hooks

**hooks/useQuickCreate.ts** - Hook for managing quick creation actions with loading states and error handling.

**hooks/useQuickExpense.ts** - Hook specifically for quick expense creation with form validation.

### API Service

**services/api.ts** - Centralized API client with functions for all backend endpoints, error handling, and response transformation.

## Key Dependencies
- **react**: Core React library
- **react-router-dom**: Client-side routing
- **recharts**: Data visualization and charting
- **axios**: HTTP client for API calls
- **react-query**: Data fetching and caching
- **tailwindcss**: Utility-first CSS framework

## UI/UX Patterns
- **Responsive Design**: Mobile-first approach with breakpoints for different screen sizes
- **Dark/Light Mode**: Theme support with CSS custom properties
- **Loading States**: Skeleton loaders and spinners for async operations
- **Error Handling**: Error boundaries and user-friendly error messages
- **Form Validation**: Real-time validation with visual feedback

## Data Flow
1. User interactions trigger component events
2. Components use custom hooks for business logic
3. API service communicates with backend
4. Context providers update global state
5. Components re-render with new data
6. UI updates reflect current application state

## Performance Optimizations
- **Code Splitting**: Lazy loading of routes and components
- **Memoization**: React.memo and useMemo for expensive computations
- **Virtual Scrolling**: For large data tables and lists
- **Image Optimization**: Lazy loading and compression for images
- **Bundle Analysis**: Regular monitoring of bundle size and dependencies