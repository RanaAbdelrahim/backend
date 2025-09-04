import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { signJwt } from '../utils/jwt.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// Simple ping endpoint to check if server is online
router.get('/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Server is online' });
});

router.post(
  '/register',
  [
    body('name').notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('role').optional().isIn(['admin', 'user']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { name, email, password, role, age, gender, location, interests } = req.body;
      const exists = await User.findOne({ email });

      if (exists) return res.status(409).json({ message: 'Email already registered' });

      const user = new User({
        name,
        email,
        password,
        role: role || 'user',
        age,
        gender,
        location,
        interests,
      });
      await user.save();

      const token = signJwt({ id: user._id, role: user.role });

      // Remove cookie setting since we don't have cookie-parser

      res.json({ token, user: { id: user._id, name, email, role: user.role } });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ message: 'Registration failed: ' + err.message });
    }
  }
);

router.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { email, password } = req.body;
      console.log(`Login attempt for: ${email}`);

      const user = await User.findOne({ email });
      if (!user) {
        console.log(`User not found: ${email}`);
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const ok = await user.comparePassword(password);
      if (!ok) {
        console.log(`Invalid password for: ${email}`);
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      console.log(`Successful login for: ${email}, role: ${user.role}`);
      const token = signJwt({ id: user._id, role: user.role });

      // Remove cookie setting since we don't have cookie-parser

      res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ message: 'Login failed: ' + err.message });
    }
  }
);

router.get('/me', auth, async (req, res) => {
  const u = req.user;
  res.json({ user: { id: u._id, name: u.name, email: u.email, role: u.role } });
});

export default router;
