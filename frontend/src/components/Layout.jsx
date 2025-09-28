import { Link, useLocation } from 'react-router-dom'
import { useBackendStatus } from '../context/BackendStatusContext'

const Layout = ({ children }) => {
  const location = useLocation()
  const { isOnline } = useBackendStatus()
  
  const navigation = [
    { name: 'Transactions', href: '/', current: location.pathname === '/' },
    { name: 'Admin', href: '/admin', current: location.pathname === '/admin' },
    { name: 'Reports', href: '/reports', current: location.pathname === '/reports' },
  ]

  return (
    <div className={`min-h-screen bg-gray-50 ${!isOnline ? 'pt-12' : ''}`} style={{ display: 'block', visibility: 'visible', opacity: 1, height: 'auto', minHeight: '100vh' }}>
      <nav className="bg-white shadow" style={{ display: 'block', visibility: 'visible', opacity: 1 }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex">
              <div className="flex flex-shrink-0 items-center">
                <h1 className="text-xl font-bold text-gray-900">Nami</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`${
                      item.current
                        ? 'border-blue-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    } inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium`}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8" style={{ display: 'block', visibility: 'visible', opacity: 1, height: 'auto' }}>
        {children}
      </main>
    </div>
  )
}

export default Layout
