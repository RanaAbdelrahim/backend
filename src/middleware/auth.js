import { verifyJwt } from '../utils/jwt.js';
import User from '../models/User.js';

export async function auth(req, res, next) {
  try {
    // Accept: Authorization: Bearer <token> (case-insensitive) or x-access-token
    const header = req.headers.authorization || req.headers.Authorization || '';
    let token = null;

    if (typeof header === 'string') {
      const parts = header.trim().split(/\s+/);
      if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
        token = parts[1];
      }
    }
    token = token || req.headers['x-access-token'];

    if (!token) {
      return res.status(401).json({ message: 'Unauthorized', code: 'AUTH_NO_TOKEN' });
    }

    const decoded = verifyJwt(token);
    if (!decoded?.id) {
      return res.status(401).json({ message: 'Invalid token payload', code: 'AUTH_INVALID_TOKEN' });
    }

    // exclude sensitive fields
    const user = await User.findById(decoded.id).select('-password -__v').lean();
    if (!user) {
      return res.status(401).json({ message: 'User not found or token invalid', code: 'AUTH_USER_NOT_FOUND' });
    }

    req.user = user;
    return next();
  } catch (e) {
    if (e?.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired', code: 'AUTH_TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Unauthorized', code: 'AUTH_INVALID_TOKEN' });
  }
}

/**
 * Usage:
 *   app.get('/admin', auth, requireRole('admin'), handler)
 *   app.get('/staff', auth, requireRole('admin', 'staff'), handler)
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Requires role: ${roles.join(', ')}`, code: 'AUTH_INSUFFICIENT_ROLE' });
    }
    return next();
  };
}
