/**
 * Express middleware for error handling, validation, and logging
 */

import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError, isAppError, ValidationError } from "./errors";
import { logger } from "./logger";
import { config } from "./config";

/**
 * Standard error response format
 */
interface ErrorResponse {
    error: string;
    code?: string;
    details?: unknown;
    stack?: string;
}

/**
 * Global error handling middleware
 * Catches all errors and returns consistent response format
 */
export function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    // Log error
    if (err instanceof Error) {
        logger.error(`${req.method} ${req.path} - ${err.message}`, err, {
            method: req.method,
            path: req.path,
            query: req.query,
        });
    } else {
        logger.error(`${req.method} ${req.path} - Unknown error`, undefined, {
            method: req.method,
            path: req.path,
            error: err,
        });
    }

    // Handle Zod validation errors
    if (err instanceof ZodError) {
        const response: ErrorResponse = {
            error: "Validation failed",
            code: "VALIDATION_ERROR",
            details: err.errors,
        };
        res.status(400).json(response);
        return;
    }

    // Handle application errors
    if (isAppError(err)) {
        const response = err.toJSON() as unknown as ErrorResponse;
        // Include stack trace in development
        if (config.isDevelopment && err.stack) {
            response.stack = err.stack;
        }
        res.status(err.statusCode).json(response);
        return;
    }

    // Handle generic errors
    if (err instanceof Error) {
        const response: ErrorResponse = {
            error: err.message || "Internal server error",
        };
        if (config.isDevelopment && err.stack) {
            response.stack = err.stack;
        }
        res.status(500).json(response);
        return;
    }

    // Unknown error type
    res.status(500).json({
        error: "Internal server error",
    });
}

/**
 * Request logging middleware
 * Logs incoming requests with timing
 */
export function requestLogger(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const start = Date.now();

    res.on("finish", () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.path} - ${res.statusCode}`, {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
        });
    });

    next();
}

/**
 * Request validation middleware factory
 * Validates request body against a Zod schema
 */
export function validateRequest<T>(schema: { parse: (data: unknown) => T }) {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
    res.status(404).json({
        error: "Not found",
        code: "NOT_FOUND",
        details: { path: req.method + " " + req.path },
    });
}

/**
 * Async route wrapper to catch errors in async handlers
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
