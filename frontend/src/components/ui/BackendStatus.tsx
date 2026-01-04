import { Button } from '@/components/ui/button';

import { useBackendStatus } from '../../context/BackendStatusContext';

const BackendStatus = () => {
    const { isOnline, lastChecked, isChecking, retryCount, retryConnection } =
        useBackendStatus();

    if (isOnline) {
        return null; // Don't show anything when backend is online
    }

    const formatTime = (date: Date | null | undefined): string => {
        if (!date) return 'Never';
        return date.toLocaleTimeString();
    };

    return (
        <div className="fixed top-0 left-0 right-0 bg-destructive text-destructive-foreground px-4 py-2 z-50 shadow-md">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
                <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-destructive-foreground/50 rounded-full animate-pulse"></div>
                        <span className="font-medium">Backend Offline</span>
                    </div>
                    <span className="text-destructive-foreground/80 text-sm">
                        {isChecking
                            ? 'Checking...'
                            : `Last checked: ${formatTime(lastChecked)}`}
                    </span>
                    {retryCount > 0 && (
                        <span className="text-destructive-foreground/80 text-sm">
                            (Retry #{retryCount})
                        </span>
                    )}
                </div>

                <div className="flex items-center space-x-3">
                    <span className="text-destructive-foreground/80 text-sm hidden sm:block">
                        Some features may not work properly
                    </span>
                    <Button
                        onClick={retryConnection}
                        disabled={isChecking}
                        variant="secondary"
                        size="sm"
                        className="bg-destructive-foreground/10 hover:bg-destructive-foreground/20 text-destructive-foreground"
                    >
                        {isChecking ? 'Checking...' : 'Retry'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default BackendStatus;
