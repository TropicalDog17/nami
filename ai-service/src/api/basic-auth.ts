/**
 * Basic authentication middleware for AI service
 */

import { Request, Response, NextFunction } from 'express'
import { timingSafeEqual } from 'crypto'
import { AppConfig } from '../utils/config.js'
import { logger } from '../utils/logger.js'

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Create basic auth middleware with the given config
 */
export function createBasicAuthMiddleware(cfg: AppConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!cfg.basicAuthEnabled) {
      next()
      return
    }

    const username = cfg.BASIC_AUTH_USERNAME
    const password = cfg.BASIC_AUTH_PASSWORD

    if (!username || !password) {
      logger.warn('Basic auth enabled but credentials not configured')
      res.status(500).json({ error: 'Authentication not configured' })
      return
    }

    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Nami AI"')
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    try {
      const base64Credentials = authHeader.slice(6)
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
      const [providedUsername, providedPassword] = credentials.split(':')

      if (!providedUsername || !providedPassword) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Nami AI"')
        res.status(401).json({ error: 'Invalid credentials format' })
        return
      }

      const usernameValid = safeCompare(providedUsername, username)
      const passwordValid = safeCompare(providedPassword, password)

      if (usernameValid && passwordValid) {
        next()
      } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Nami AI"')
        res.status(401).json({ error: 'Invalid credentials' })
      }
    } catch {
      res.setHeader('WWW-Authenticate', 'Basic realm="Nami AI"')
      res.status(401).json({ error: 'Invalid authorization header' })
    }
  }
}
