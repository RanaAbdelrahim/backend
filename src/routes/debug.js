import express from 'express';
import User from '../models/User.js';
import Event from '../models/Event.js';
import Booking from '../models/Booking.js';
import ManageEvent from '../models/ManageEvent.js';
import { dbStatus } from '../lib/db.js';

const router = express.Router();

// These routes are only for development & debugging purposes
// They should be disabled in production

// Check if admin user exists
router.get('/check-admin', async (req, res) => {
  try {
    const admin = await User.findOne({ email: 'admin@eventx.dev' });
    
    if (admin) {
      return res.json({
        exists: true,
        email: admin.email,
        role: admin.role,
        message: 'Admin user found'
      });
    } else {
      return res.json({
        exists: false,
        message: 'Admin user not found'
      });
    }
  } catch (err) {
    console.error('Error checking admin user:', err);
    return res.status(500).json({ 
      message: 'Error checking admin user',
      error: err.message
    });
  }
});

// Check if server is running
router.get('/ping', (_req, res) => {
  res.json({ status: 'ok', message: 'Debug API is working' });
});

// Check if admin user exists (helpful for troubleshooting)
router.get('/check-admin', async (_req, res) => {
  try {
    const admin = await User.findOne({ email: 'admin@eventx.dev' });
    
    if (admin) {
      res.json({ 
        exists: true, 
        email: admin.email,
        role: admin.role,
        message: 'Admin user exists in the database'
      });
    } else {
      res.json({ 
        exists: false, 
        message: 'Admin user does not exist in the database. Try running the seed script.'
      });
    }
  } catch (err) {
    console.error('Error checking admin:', err);
    res.status(500).json({ 
      error: true, 
      message: 'Database error when checking admin user', 
      details: err.message 
    });
  }
});

// Get basic server info (helpful for debugging)
router.get('/server-info', (_req, res) => {
  res.json({
    nodeVersion: process.version,
    platform: process.platform,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      // Don't expose sensitive info like MONGO_URI or JWT_SECRET
      CLIENT_URL: process.env.CLIENT_URL,
      SEED_ON_START: process.env.SEED_ON_START
    }
  });
});

// Get database stats
router.get('/stats', async (req, res) => {
  try {
    const [users, events, bookings, manageEvents] = await Promise.all([
      User.countDocuments(),
      Event.countDocuments(),
      Booking.countDocuments(),
      ManageEvent.countDocuments()
    ]);
    
    res.json({
      counts: { users, events, bookings, manageEvents },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get environment info (sanitized)
router.get('/env', (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV || 'development',
    clientUrl: process.env.CLIENT_URL || '(not set)',
    mongoDB: process.env.MONGO_URI ? 'Connected' : 'Not configured',
    seed: process.env.SEED_ON_START || 'false'
  });
});

// Get database status
router.get('/db-status', (req, res) => {
  try {
    const status = dbStatus();
    res.json({
      status: 'ok',
      db: status
    });
  } catch (err) {
    console.error('Error getting DB status:', err);
    res.status(500).json({
      message: 'Error getting DB status',
      error: err.message
    });
  }
});

// Check if admin user exists - used by login page to validate setup
router.get('/check-admin', async (req, res) => {
  try {
    const adminUser = await User.findOne({ email: 'admin@eventx.dev' });
    
    res.json({
      exists: !!adminUser,
      email: adminUser ? adminUser.email : null
    });
  } catch (error) {
    console.error('Error checking admin:', error);
    res.status(500).json({ message: 'Server error checking admin account' });
  }
});

// Basic server ping endpoint
router.get('/ping', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

export default router;
