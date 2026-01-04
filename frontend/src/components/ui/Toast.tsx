import { toast as sonnerToast, Toaster } from 'sonner';

export const ToastTypes = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
} as const;

type ToastType = (typeof ToastTypes)[keyof typeof ToastTypes];

interface PromiseOptions<T> {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: unknown) => string);
}

function promiseToast<T>(promise: Promise<T>, options: PromiseOptions<T>) {
    return sonnerToast.promise(promise, options);
}

/**
 * Toast utility functions using Sonner
 */
// eslint-disable-next-line react-refresh/only-export-components
export const toast = {
    success: (message: string) => sonnerToast.success(message),
    error: (message: string) => sonnerToast.error(message),
    warning: (message: string) => sonnerToast.warning(message),
    info: (message: string) => sonnerToast.info(message),
    promise: promiseToast,
};

/**
 * Legacy useToast hook for backward compatibility
 * Deprecated: Use the toast export directly instead
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
    return {
        toasts: [],
        addToast: (message: string, type: ToastType = ToastTypes.INFO) => {
            switch (type) {
                case ToastTypes.SUCCESS:
                    toast.success(message);
                    break;
                case ToastTypes.ERROR:
                    toast.error(message);
                    break;
                case ToastTypes.WARNING:
                    toast.warning(message);
                    break;
                case ToastTypes.INFO:
                default:
                    toast.info(message);
                    break;
            }
            return Date.now();
        },
        removeToast: () => {},
        success: toast.success,
        error: toast.error,
        warning: toast.warning,
        info: toast.info,
    };
}

/**
 * Export Toaster component
 * Place this in your app root
 */
export { Toaster };

/**
 * Default export that wraps with Toaster
 * Use this in App.tsx like: <ToastWithProvider>{children}</ToastWithProvider>
 */
export default function ToastWithProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            {children}
            <Toaster position="top-right" richColors closeButton />
        </>
    );
}
