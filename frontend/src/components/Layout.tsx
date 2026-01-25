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
            name: 'Cash Flow',
            href: '/cashflow',
            current: location.pathname === '/cashflow',
        },
        {
            name: 'Spending',
            href: '/spending',
            current: location.pathname === '/spending',
        },
        {
            name: 'Vaults',
            href: '/vaults',
            current:
                location.pathname === '/vaults' ||
                location.pathname.startsWith('/vault/'),
        },
        {
            name: 'Borrowing',
            href: '/borrowings',
            current: location.pathname === '/borrowings',
        },
        {
            name: 'Admin',
            href: '/admin',
            current: location.pathname === '/admin',
        },
        {
            name: 'AI Advisor',
            href: '/ai-advisor',
            current: location.pathname === '/ai-advisor',
        },
    ];

    return (
        <div className={`min-h-screen bg-muted/30 ${!isOnline ? 'pt-12' : ''}`}>
            <nav className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 justify-between">
                        <div className="flex">
                            <Link
                                to="/"
                                className="flex flex-shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xl font-semibold tracking-tight text-foreground transition-all duration-200 hover:bg-primary/10 hover:text-primary"
                            >
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                                    <span className="text-sm font-bold">N</span>
                                </div>
                                <span>Nami</span>
                            </Link>
                            <div className="hidden sm:ml-8 sm:flex sm:space-x-1 items-center">
                                {navigation.map((item) => (
                                    <Link
                                        key={item.name}
                                        to={item.href}
                                        className={`${
                                            item.current
                                                ? 'bg-primary/10 text-primary'
                                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                        } rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200`}
                                    >
                                        {item.name}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    );
};

export default Layout;
