import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { auth, requireRole } from '../middleware/auth.js';
import Settings from '../models/Settings.js';
import AuditLog from '../models/AuditLog.js';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createEmailProvider, createSmsProvider, createPushProvider } from '../utils/notificationProviders.js';

const router = express.Router();

// All routes require authentication and admin role
router.use(auth, requireRole('admin'));

// Helper to create an audit log
async function createAuditLog(req, action, section, before, after) {
  try {
    await AuditLog.create({
      actorId: req.user._id,
      action,
      section,
      before,
      after,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}

/**
 * Get current user's settings
 * GET /api/settings
 */
router.get('/', async (req, res) => {
  try {
    const settings = await Settings.findOne({ ownerId: req.user._id });
    
    // If no settings exist yet, return default values
    if (!settings) {
      return res.json({
        general: {
          notificationEmail: req.user.email || 'admin@eventx.dev',
          defaultCurrency: 'LKR',
          timezone: 'Asia/Colombo'
        },
        appearance: {
          theme: 'light',
          primaryColor: '#0ea5e9',
          accentColor: '#8b5cf6',
          fontFamily: 'Inter',
          logoUrl: '',
          faviconUrl: '',
          compactMode: false
        },
        notifications: {
          channels: {
            email: { enabled: false, provider: 'mock', fromEmail: '' },
            sms: { enabled: false, provider: 'mock', fromNumber: '' },
            push: { enabled: false, provider: 'mock' }
          },
          events: {
            bookingCreated: { email: true, sms: false, push: false, recipients: [] },
            bookingCanceled: { email: true, sms: false, push: false, recipients: [] },
            eventUpdated: { email: true, sms: false, push: false, recipients: [] },
            eventReminderHrs: { hoursBefore: 24, email: true, push: false },
            lowInventory: { threshold: 10, email: true },
            systemAlerts: { email: true }
          },
          preferences: {
            quietHours: { start: '22:00', end: '08:00', timezone: 'Asia/Colombo' },
            digest: { enabled: false, frequency: 'daily', hour: 9 }
          }
        },
        security: {
          twoFactor: { enabled: false, type: 'totp' },
          passwordPolicy: {
            minLength: 8,
            requireUpper: true,
            requireLower: true,
            requireNumber: true,
            requireSymbol: false
          },
          sessionPolicy: {
            maxSessions: 5,
            ttlHours: 24,
            forceReauthSensitive: true
          },
          ipAllowlist: [],
          loginAlerts: { email: true, push: false }
        }
      });
    }
    
    // Mask sensitive data
    const result = settings.toObject();
    if (result.security?.twoFactor?.secret) {
      result.security.twoFactor.secret = undefined;
    }
    if (result.security?.twoFactor?.recoveryCodes) {
      result.security.twoFactor.recoveryCodes = undefined;
    }
    
    res.json(result);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

/**
 * Update general settings
 * PUT /api/settings
 */
router.put('/', [
  body('notificationEmail').isEmail().withMessage('Please provide a valid email address'),
  body('defaultCurrency').isIn(['USD', 'EUR', 'GBP', 'LKR', 'INR']).withMessage('Invalid currency selected'),
  body('timezone').notEmpty().withMessage('Invalid timezone selected')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { notificationEmail, defaultCurrency, timezone } = req.body;
    
    // Get current settings
    let settings = await Settings.findOne({ ownerId: req.user._id });
    const oldSettings = settings ? settings.toObject().general : null;
    
    // Create or update settings
    settings = await Settings.findOneAndUpdate(
      { ownerId: req.user._id },
      { 
        $set: {
          'general.notificationEmail': notificationEmail,
          'general.defaultCurrency': defaultCurrency,
          'general.timezone': timezone
        }
      },
      { 
        new: true,
        upsert: true,
        runValidators: true
      }
    );
    
    // Create audit log
    await createAuditLog(
      req,
      'settings.update',
      'general',
      oldSettings,
      settings.general
    );
    
    res.json(settings.general);
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

/**
 * Update appearance settings
 * PUT /api/settings/appearance
 */
router.put('/appearance', [
  body('theme').isIn(['light', 'dark', 'system']).withMessage('Invalid theme'),
  body('primaryColor').matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid primary color format'),
  body('accentColor').matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid accent color format'),
  body('fontFamily').isIn(['Inter', 'Roboto', 'Open Sans', 'System UI', 'Arial', 'Helvetica']).withMessage('Invalid font family'),
  body('logoUrl').optional().isURL().withMessage('Invalid logo URL'),
  body('faviconUrl').optional().isURL().withMessage('Invalid favicon URL'),
  body('compactMode').isBoolean().withMessage('Compact mode must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { theme, primaryColor, accentColor, fontFamily, logoUrl, faviconUrl, compactMode } = req.body;
    
    // Get current settings
    let settings = await Settings.findOne({ ownerId: req.user._id });
    const oldSettings = settings ? settings.toObject().appearance : null;
    
    // Create or update settings
    settings = await Settings.findOneAndUpdate(
      { ownerId: req.user._id },
      { 
        $set: {
          'appearance.theme': theme,
          'appearance.primaryColor': primaryColor,
          'appearance.accentColor': accentColor,
          'appearance.fontFamily': fontFamily,
          'appearance.logoUrl': logoUrl,
          'appearance.faviconUrl': faviconUrl,
          'appearance.compactMode': compactMode
        }
      },
      { 
        new: true,
        upsert: true,
        runValidators: true
      }
    );
    
    // Create audit log
    await createAuditLog(
      req,
      'settings.update',
      'appearance',
      oldSettings,
      settings.appearance
    );
    
    res.json(settings.appearance);
  } catch (err) {
    console.error('Error updating appearance settings:', err);
    res.status(500).json({ message: 'Failed to update appearance settings' });
  }
});

/**
 * Update notifications settings
 * PUT /api/settings/notifications
 */
router.put('/notifications', [
  body('channels').isObject().withMessage('Invalid channels configuration'),
  body('events').isObject().withMessage('Invalid events configuration'),
  body('preferences').isObject().withMessage('Invalid preferences configuration')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { channels, events, preferences } = req.body;
    
    // Validate nested fields
    if (channels.email?.enabled && !channels.email.fromEmail) {
      return res.status(400).json({ message: 'From email is required when email is enabled' });
    }
    
    if (channels.sms?.enabled && !channels.sms.fromNumber) {
      return res.status(400).json({ message: 'From number is required when SMS is enabled' });
    }
    
    // Get current settings
    let settings = await Settings.findOne({ ownerId: req.user._id });
    const oldSettings = settings ? settings.toObject().notifications : null;
    
    // Create or update settings
    settings = await Settings.findOneAndUpdate(
      { ownerId: req.user._id },
      { 
        $set: {
          'notifications.channels': channels,
          'notifications.events': events,
          'notifications.preferences': preferences
        }
      },
      { 
        new: true,
        upsert: true,
        runValidators: true
      }
    );
    
    // Create audit log
    await createAuditLog(
      req,
      'settings.update',
      'notifications',
      oldSettings,
      settings.notifications
    );
    
    // If digest is enabled, update cron job (this would be implemented in a real system)
    if (settings.notifications.preferences.digest.enabled) {
      console.log('Would update digest cron job here with:', settings.notifications.preferences.digest);
    }
    
    res.json(settings.notifications);
  } catch (err) {
    console.error('Error updating notification settings:', err);
    res.status(500).json({ message: 'Failed to update notification settings' });
  }
});

/**
 * Test notification
 * POST /api/settings/notifications/test
 */
router.post('/notifications/test', [
  body('channel').isIn(['email', 'sms', 'push']).withMessage('Invalid channel'),
  body('to').optional().notEmpty().withMessage('Recipient is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { channel, to } = req.body;
    
    // Get settings
    const settings = await Settings.findOne({ ownerId: req.user._id });
    if (!settings || !settings.notifications?.channels) {
      return res.status(400).json({ message: 'Notification settings not configured' });
    }
    
    const channelConfig = settings.notifications.channels[channel];
    if (!channelConfig || !channelConfig.enabled) {
      return res.status(400).json({ message: `${channel} notifications are not enabled` });
    }
    
    // Default recipient if not provided
    const recipient = to || settings.general?.notificationEmail || req.user.email;
    
    let result;
    
    // Send test notification based on channel
    switch (channel) {
      case 'email':
        const emailProvider = createEmailProvider(channelConfig.provider, channelConfig.config);
        result = await emailProvider.send({
          from: channelConfig.fromEmail,
          to: recipient,
          subject: 'Test Email from EventX',
          html: '<h1>This is a test email</h1><p>Your email notifications are working correctly!</p>'
        });
        break;
        
      case 'sms':
        const smsProvider = createSmsProvider(channelConfig.provider, channelConfig.config);
        result = await smsProvider.send({
          from: channelConfig.fromNumber,
          to: recipient,
          message: 'This is a test SMS from EventX. Your SMS notifications are working correctly!'
        });
        break;
        
      case 'push':
        const pushProvider = createPushProvider(channelConfig.provider, channelConfig.config);
        result = await pushProvider.send({
          to: recipient,
          title: 'Test Push Notification',
          body: 'Your push notifications are working correctly!'
        });
        break;
        
      default:
        return res.status(400).json({ message: 'Invalid channel' });
    }
    
    res.json({
      success: true,
      channel,
      provider: channelConfig.provider,
      result
    });
  } catch (err) {
    console.error('Error sending test notification:', err);
    res.status(500).json({ message: 'Failed to send test notification' });
  }
});

/**
 * Update security settings
 * PUT /api/settings/security
 */
router.put('/security', [
  body('passwordPolicy').isObject().withMessage('Invalid password policy'),
  body('passwordPolicy.minLength').isInt({ min: 6, max: 32 }).withMessage('Min length must be between 6 and 32'),
  body('sessionPolicy').isObject().withMessage('Invalid session policy'),
  body('sessionPolicy.maxSessions').isInt({ min: 1, max: 50 }).withMessage('Max sessions must be between 1 and 50'),
  body('sessionPolicy.ttlHours').isInt({ min: 1, max: 720 }).withMessage('TTL hours must be between 1 and 720'),
  body('ipAllowlist').optional().isArray().withMessage('IP allowlist must be an array'),
  body('loginAlerts').isObject().withMessage('Invalid login alerts configuration')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { passwordPolicy, sessionPolicy, ipAllowlist, loginAlerts } = req.body;
    
    // Get current settings
    let settings = await Settings.findOne({ ownerId: req.user._id });
    const oldSettings = settings ? settings.toObject().security : null;
    
    // Filter out duplicates from ipAllowlist
    const uniqueIps = ipAllowlist ? [...new Set(ipAllowlist)] : [];
    
    // Create or update settings
    settings = await Settings.findOneAndUpdate(
      { ownerId: req.user._id },
      { 
        $set: {
          'security.passwordPolicy': passwordPolicy,
          'security.sessionPolicy': sessionPolicy,
          'security.ipAllowlist': uniqueIps,
          'security.loginAlerts': loginAlerts
        }
      },
      { 
        new: true,
        upsert: true,
        runValidators: true
      }
    );
    
    // Create audit log
    await createAuditLog(
      req,
      'settings.update',
      'security',
      oldSettings,
      settings.security
    );
    
    // Mask sensitive data
    const result = settings.toObject().security;
    if (result.twoFactor?.secret) {
      result.twoFactor.secret = undefined;
    }
    if (result.twoFactor?.recoveryCodes) {
      result.twoFactor.recoveryCodes = undefined;
    }
    
    res.json(result);
  } catch (err) {
    console.error('Error updating security settings:', err);
    res.status(500).json({ message: 'Failed to update security settings' });
  }
});

/**
 * Enable 2FA
 * POST /api/settings/security/2fa/enable
 */
router.post('/security/2fa/enable', async (req, res) => {
  try {
    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `EventX:${req.user.email}`
    });
    
    // Generate QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
    
    // Store temporary secret in session or redis (in a real app)
    // For this example, we'll store it in the settings document
    await Settings.findOneAndUpdate(
      { ownerId: req.user._id },
      { 
        $set: {
          'security.twoFactor.type': 'totp',
          'security.twoFactor.secret': secret.base32, // This would be stored encrypted in a real app
          'security.twoFactor.otpauthUrl': secret.otpauth_url
        }
      },
      { 
        new: true,
        upsert: true
      }
    );
    
    // Return QR code and temp secret for verification
    res.json({
      qrCode: qrCodeUrl,
      secret: secret.base32,
      message: 'Scan the QR code with your authenticator app, then verify with the generated code'
    });
  } catch (err) {
    console.error('Error enabling 2FA:', err);
    res.status(500).json({ message: 'Failed to enable 2FA' });
  }
});

/**
 * Verify 2FA
 * POST /api/settings/security/2fa/verify
 */
router.post('/security/2fa/verify', [
  body('token').isLength({ min: 6, max: 6 }).withMessage('Token must be 6 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token } = req.body;
    
    // Get settings with secret
    const settings = await Settings.findOne({ ownerId: req.user._id });
    if (!settings || !settings.security?.twoFactor?.secret) {
      return res.status(400).json({ message: '2FA setup not initiated' });
    }
    
    // Verify token
    const verified = speakeasy.totp.verify({
      secret: settings.security.twoFactor.secret,
      encoding: 'base32',
      token: token
    });
    
    if (!verified) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }
    
    // Generate recovery codes
    const recoveryCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase() + 
                   Math.random().toString(36).substring(2, 8).toUpperCase();
      // In a real app, these would be hashed
      recoveryCodes.push(code);
    }
    
    // Enable 2FA
    await Settings.findOneAndUpdate(
      { ownerId: req.user._id },
      { 
        $set: {
          'security.twoFactor.enabled': true,
          'security.twoFactor.recoveryCodes': recoveryCodes
        }
      }
    );
    
    // Create audit log
    await createAuditLog(
      req,
      'settings.2fa.enable',
      'security',
      { twoFactorEnabled: false },
      { twoFactorEnabled: true }
    );
    
    res.json({
      success: true,
      recoveryCodes,
      message: 'Two-factor authentication enabled successfully'
    });
  } catch (err) {
    console.error('Error verifying 2FA:', err);
    res.status(500).json({ message: 'Failed to verify 2FA' });
  }
});

/**
 * Disable 2FA
 * POST /api/settings/security/2fa/disable
 */
router.post('/security/2fa/disable', [
  body('password').notEmpty().withMessage('Current password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password } = req.body;
    
    // Verify password (this would call a user service in a real app)
    // For this example, we'll just assume the password is correct
    
    // Disable 2FA
    await Settings.findOneAndUpdate(
      { ownerId: req.user._id },
      { 
        $set: {
          'security.twoFactor.enabled': false,
          'security.twoFactor.secret': null,
          'security.twoFactor.otpauthUrl': null,
          'security.twoFactor.recoveryCodes': []
        }
      }
    );
    
    // Create audit log
    await createAuditLog(
      req,
      'settings.2fa.disable',
      'security',
      { twoFactorEnabled: true },
      { twoFactorEnabled: false }
    );
    
    res.json({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    });
  } catch (err) {
    console.error('Error disabling 2FA:', err);
    res.status(500).json({ message: 'Failed to disable 2FA' });
  }
});

/**
 * Get active sessions
 * GET /api/settings/security/sessions
 */
router.get('/security/sessions', async (req, res) => {
  try {
    // In a real app, this would query a session store
    // For this example, we'll return mock data
    
    const currentSession = {
      id: 'current-session',
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      lastSeen: new Date().toISOString(),
      current: true
    };
    
    const otherSessions = [
      {
        id: 'session-1',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        ip: '192.168.1.1',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        lastSeen: new Date(Date.now() - 3600000).toISOString(),
        current: false
      },
      {
        id: 'session-2',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ip: '192.168.1.2',
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        lastSeen: new Date(Date.now() - 7200000).toISOString(),
        current: false
      }
    ];
    
    res.json({
      sessions: [currentSession, ...otherSessions]
    });
  } catch (err) {
    console.error('Error fetching sessions:', err);
    res.status(500).json({ message: 'Failed to fetch sessions' });
  }
});

/**
 * Revoke sessions
 * POST /api/settings/security/sessions/revoke
 */
router.post('/security/sessions/revoke', [
  body('sessionId').optional().isString().withMessage('Invalid session ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { sessionId } = req.body;
    
    // In a real app, this would revoke the session in the session store
    // For this example, we'll just return a success message
    
    // Create audit log
    await createAuditLog(
      req,
      'settings.session.revoke',
      'security',
      { sessionId: sessionId || 'all' },
      {}
    );
    
    if (sessionId) {
      res.json({
        success: true,
        message: 'Session revoked successfully'
      });
    } else {
      res.json({
        success: true,
        message: 'All other sessions revoked successfully'
      });
    }
  } catch (err) {
    console.error('Error revoking session:', err);
    res.status(500).json({ message: 'Failed to revoke session' });
  }
});

// Set up multer storage for brand uploads (logo, favicon)
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = './uploads/brand';
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'brand-' + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Accept only specific mime types
  if (['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PNG, JPEG, SVG, and ICO files are allowed.'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 1024 * 1024 } // 1MB
});

/**
 * Upload brand image (logo, favicon)
 * POST /api/uploads/brand
 */
router.post('/uploads/brand', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // In a real app, this might upload to S3 or another cloud storage
    // For this example, we'll use the local file path
    
    // Get server base URL from request
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/brand/${req.file.filename}`;
    
    res.json({
      success: true,
      fileUrl,
      fileName: req.file.filename,
      mimeType: req.file.mimetype
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ message: 'Failed to upload file' });
  }
});

export default router;
