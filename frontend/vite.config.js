import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { timingSafeEqual } from 'crypto';
/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;

    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * Basic Auth plugin for Vite dev server
 */
export function basicAuthPlugin({ enabled, username, password }) {
    const isEnabled = enabled === 'true' || enabled === '1';

    return {
        name: 'basic-auth',

        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                // Auth disabled → allow all requests
                if (!isEnabled) {
                    return next();
                }

                // Misconfiguration protection
                if (!username || !password) {
                    console.warn('[basic-auth] Missing credentials');
                    res.statusCode = 500;
                    res.end('Authentication not configured');
                    return;
                }

                const authHeader = req.headers.authorization;

                // No auth header → prompt browser
                if (!authHeader || !authHeader.startsWith('Basic ')) {
                    res.setHeader(
                        'WWW-Authenticate',
                        'Basic realm="Vite Dev Server"'
                    );
                    res.statusCode = 401;
                    res.end('Authentication required');
                    return;
                }

                try {
                    // Decode credentials
                    const base64Credentials = authHeader.slice(6);
                    const decoded = Buffer.from(
                        base64Credentials,
                        'base64'
                    ).toString('utf8');

                    const separatorIndex = decoded.indexOf(':');
                    if (separatorIndex === -1) {
                        throw new Error('Invalid credential format');
                    }

                    const providedUsername = decoded.slice(0, separatorIndex);
                    const providedPassword = decoded.slice(separatorIndex + 1);

                    const usernameValid = safeCompare(
                        providedUsername,
                        username
                    );
                    const passwordValid = safeCompare(
                        providedPassword,
                        password
                    );

                    if (usernameValid && passwordValid) {
                        return next();
                    }

                    // Invalid credentials
                    res.setHeader(
                        'WWW-Authenticate',
                        'Basic realm="Vite Dev Server"'
                    );
                    res.statusCode = 401;
                    res.end('Invalid credentials');
                } catch (err) {
                    // Malformed header / base64
                    res.setHeader(
                        'WWW-Authenticate',
                        'Basic realm="Vite Dev Server"'
                    );
                    res.statusCode = 401;
                    res.end('Invalid authorization header');
                }
            });
        },
    };
}

export default defineConfig(({ mode }) => {
    // Load env files for the current mode
    const env = loadEnv(mode, process.cwd(), '');

    return {
        plugins: [
            basicAuthPlugin({
                enabled: env.BASIC_AUTH_ENABLED,
                username: env.BASIC_AUTH_USERNAME,
                password: env.BASIC_AUTH_PASSWORD,
            }),
            react(),
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        server: {
            allowedHosts: [
                'localhost',
                '127.0.0.1',
                'tropicaldog17-ms-7e02.tail28e1c9.ts.net' // <-- add this
            ], port: Number(env.PORT) || 3000,
            host: env.HOST || '0.0.0.0',
            proxy: {
                '/api': {
                    target: 'http://127.0.0.1:8080', // backend running on localhost:8080
                    changeOrigin: true,
                    secure: false
                }
            }
        },
    };
});
