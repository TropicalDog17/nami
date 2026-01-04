/**
 * Error handling utilities for the application.
 * Provides consistent error handling patterns across components.
 */

import { useCallback } from 'react';

export type ErrorHandler = (error: unknown) => void;

/**
 * Extracts a human-readable error message from various error types.
 *
 * @param error - The error to extract message from
 * @returns A string error message
 */
export function getErrorMessage(error: unknown): string {
    if (error === null || error === undefined) {
        return 'An unknown error occurred';
    }

    if (typeof error === 'string') {
        return error;
    }

    if (typeof error === 'object') {
        // Check for common error properties
        const err = error as Record<string, unknown>;

        if (err.message && typeof err.message === 'string') {
            return err.message;
        }

        if (err.error && typeof err.error === 'string') {
            return err.error;
        }

        if (err.detail && typeof err.detail === 'string') {
            return err.detail;
        }

        // Handle API response errors
        if (err.data && typeof err.data === 'object') {
            const data = err.data as Record<string, unknown>;
            if (data.message && typeof data.message === 'string') {
                return data.message;
            }
        }
    }

    return 'An unexpected error occurred';
}

/**
 * Hook for handling errors with toast notifications.
 * This is a placeholder - integrate with your toast library of choice.
 *
 * @example
 * const { handleError, handleErrorWithCallback } = useErrorHandler();
 *
 * try {
 *   await someAsyncOperation();
 * } catch (error) {
 *   handleError(error);
 * }
 */
export function useErrorHandler() {
    /**
     * Handles an error by extracting the message and displaying it.
     * Override this method to integrate with your toast library.
     */
    const handleError = useCallback(
        (error: unknown, fallbackMessage?: string): void => {
            const message = fallbackMessage
                ? `${fallbackMessage}: ${getErrorMessage(error)}`
                : getErrorMessage(error);

            // TODO: Integrate with toast library (e.g., react-hot-toast, sonner, etc.)
            // For now, just log to console
            console.error('[useErrorHandler]', message);

            // Example with react-hot-toast:
            // toast.error(message);

            // Example with sonner:
            // toast.error(message);
        },
        []
    );

    /**
     * Wraps an async function with error handling.
     *
     * @example
     * const safeFetch = handleErrorWithCallback(async () => {
     *   return await fetchData();
     * }, 'Failed to fetch data');
     */
    const handleErrorWithCallback = useCallback(
        async <T>(
            callback: () => Promise<T>,
            fallbackMessage?: string
        ): Promise<T | null> => {
            try {
                return await callback();
            } catch (error) {
                handleError(error, fallbackMessage);
                return null;
            }
        },
        [handleError]
    );

    return {
        handleError,
        handleErrorWithCallback,
        getErrorMessage,
    };
}

/**
 * Higher-order function for wrapping async functions with error handling.
 *
 * @example
 * const safeSubmit = withErrorHandling(async (data) => {
 *   await submitData(data);
 * }, (error) => {
 *   console.error('Submit failed:', error);
 * });
 */
export function withErrorHandling<
    T extends (...args: unknown[]) => Promise<unknown>,
>(fn: T, onError?: (error: unknown) => void): T {
    return (async (...args: Parameters<T>) => {
        try {
            return await fn(...args);
        } catch (error) {
            if (onError) {
                onError(error);
            } else {
                console.error('[withErrorHandling]', error);
            }
            throw error;
        }
    }) as T;
}
