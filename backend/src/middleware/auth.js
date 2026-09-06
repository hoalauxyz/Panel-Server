import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Shared-secret guard. The panel writes files and restarts a container, so it
 * must never be reachable anonymously once it is exposed to the internet.
 * Compared in constant time to avoid leaking the key byte by byte.
 */
export function requireApiKey(req, res, next) {
  if (!config.apiKey) {
    // Explicitly opted out (local dev). Warned about once at boot in server.js.
    return next();
  }

  const provided = req.get('x-api-key') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(config.apiKey);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: 'API key không hợp lệ hoặc thiếu.' });
  }

  return next();
}
