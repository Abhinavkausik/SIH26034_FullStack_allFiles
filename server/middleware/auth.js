const jwt = require('jsonwebtoken');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// A missing secret used to silently fall back to a well-known string, which
// would let anyone forge an authority token against a deployed instance.
if (IS_PRODUCTION && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in the environment before starting in production.');
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_insecure_secret_set_JWT_SECRET_in_env';

if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set. Using a development-only secret. Set it in server/.env.');
}

const ROLES = ['AUTHORITY', 'ADMIN'];

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * Accepts any of the listed roles. ADMIN implicitly satisfies AUTHORITY, so an
 * administrator can also use every inspector-facing screen.
 */
function requireRole(...allowed) {
  const allowedRoles = allowed.length ? allowed : ['AUTHORITY'];

  return function roleGuard(req, res, next) {
    const token = readToken(req);

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please log in to the Authority Portal.' });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const role = payload.role;

      if (!ROLES.includes(role)) {
        return res.status(403).json({ error: 'This action requires authority-level access.' });
      }

      const satisfied =
        allowedRoles.includes(role) || (role === 'ADMIN' && allowedRoles.includes('AUTHORITY'));

      if (!satisfied) {
        return res.status(403).json({ error: 'This action requires administrator access.' });
      }

      req.user = payload;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    }
  };
}

// Kept for backwards compatibility with the existing authority routes.
const requireAuthority = requireRole('AUTHORITY');
const requireAdmin = requireRole('ADMIN');

/** Attaches req.user when a valid token is present, but never rejects. */
function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // ignore - treated as an anonymous request
    }
  }
  next();
}

module.exports = { requireAuthority, requireAdmin, requireRole, optionalAuth, JWT_SECRET, ROLES };
