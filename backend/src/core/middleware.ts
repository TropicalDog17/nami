/**
 * Express middleware for error handling, validation, logging, and authentication
 */

import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError, isAppError, ValidationError } from "./errors";
import { logger } from "./logger";
import { config } from "./config";
import { timingSafeEqual } from "crypto";

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

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }
    // Use constant-time comparison
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);

    if (typeof timingSafeEqual === 'function') {
        try {
            return timingSafeEqual(aBuf, bBuf);
        } catch (e) {
            // Fallback to regular comparison
        }
    }

    // Fallback: XOR comparison to prevent simple timing attacks
    let result = 0;
    for (let i = 0; i < aBuf.length; i++) {
        result |= aBuf[i] ^ bBuf[i];
    }
    return result === 0;
}

/**
 * Basic authentication middleware
 * Requires valid credentials when BASIC_AUTH_ENABLED=true
 */
export function basicAuth(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (!config.basicAuthEnabled) {
        next();
        return;
    }

    const username = config.basicAuthUsername;
    const password = config.basicAuthPassword;

    if (!username || !password) {
        logger.warn("Basic auth enabled but credentials not configured");
        res.status(500).json({ error: "Authentication not configured" });
        return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Basic ")) {
        res.setHeader("WWW-Authenticate", 'Basic realm="Nami"');
        res.status(401).json({ error: "Authentication required" });
        return;
    }

    try {
        const base64Credentials = authHeader.slice(6);
        const credentials = Buffer.from(base64Credentials, "base64").toString(
            "utf-8"
        );
        const [providedUsername, providedPassword] = credentials.split(":");

        if (!providedUsername || !providedPassword) {
            res.setHeader("WWW-Authenticate", 'Basic realm="Nami"');
            res.status(401).json({ error: "Invalid credentials format" });
            return;
        }

        const usernameValid = safeCompare(providedUsername, username);
        const passwordValid = safeCompare(providedPassword, password);

        if (usernameValid && passwordValid) {
            next();
        } else {
            res.setHeader("WWW-Authenticate", 'Basic realm="Nami"');
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch {
        res.setHeader("WWW-Authenticate", 'Basic realm="Nami"');
        res.status(401).json({ error: "Invalid authorization header" });
    }
}
