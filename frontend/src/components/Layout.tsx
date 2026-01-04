import { Link, useLocation } from 'react-router-dom';

import { useBackendStatus } from '../context/BackendStatusContext';

interface LayoutProps {
    children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
    const location = useLocation();
    const { isOnline } = useBackendStatus();

    const navigation = [
        { name: 'Transactions', href: '/', current: location.pathname === '/' },
        {
            name: 'Vaults',
            href: '/vaults',
            current:
                location.pathname === '/vaults' ||
                location.pathname.startsWith('/vault/'),
        },
        {
            name: 'Admin',
            href: '/admin',
            current: location.pathname === '/admin',
        },
        {
            name: 'Reports',
            href: '/reports',
            current: location.pathname === '/reports',
        },
    ];

    return (
        <div
            className={`min-h-screen bg-background ${!isOnline ? 'pt-12' : ''}`}
        >
            <nav className="border-b bg-card shadow-sm">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 justify-between">
                        <div className="flex">
                            <div className="flex flex-shrink-0 items-center">
                                <h1 className="text-xl font-bold text-foreground">
                                    Nami
                                </h1>
                            </div>
                            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                                {navigation.map((item) => (
                                    <Link
                                        key={item.name}
                                        to={item.href}
                                        className={`${
                                            item.current
                                                ? 'border-primary text-foreground'
                                                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                                        } inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors`}
                                    >
                                        {item.name}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    );
};

export default Layout;
