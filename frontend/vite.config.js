import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { timingSafeEqual } from 'crypto'

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeCompare(a, b) {
  if (a.length !== b.length) {
    return false
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Basic auth plugin for Vite dev server
 */
function basicAuthPlugin() {
  const enabled = process.env.BASIC_AUTH_ENABLED === 'true' || process.env.BASIC_AUTH_ENABLED === '1'
  const username = process.env.BASIC_AUTH_USERNAME
  const password = process.env.BASIC_AUTH_PASSWORD

  return {
    name: 'basic-auth',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!enabled) {
          return next()
        }

        if (!username || !password) {
          console.warn('Basic auth enabled but credentials not configured')
          res.statusCode = 500
          res.end('Authentication not configured')
          return
        }

        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Basic ')) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Nami"')
          res.statusCode = 401
          res.end('Authentication required')
          return
        }

        try {
          const base64Credentials = authHeader.slice(6)
          const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
          const [providedUsername, providedPassword] = credentials.split(':')

          if (!providedUsername || !providedPassword) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Nami"')
            res.statusCode = 401
            res.end('Invalid credentials format')
            return
          }

          const usernameValid = safeCompare(providedUsername, username)
          const passwordValid = safeCompare(providedPassword, password)

          if (usernameValid && passwordValid) {
            next()
          } else {
            res.setHeader('WWW-Authenticate', 'Basic realm="Nami"')
            res.statusCode = 401
            res.end('Invalid credentials')
          }
        } catch {
          res.setHeader('WWW-Authenticate', 'Basic realm="Nami"')
          res.statusCode = 401
          res.end('Invalid authorization header')
        }
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [basicAuthPlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: process.env.PORT || 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8080',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
