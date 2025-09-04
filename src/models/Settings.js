import mongoose from 'mongoose';

// Channel configuration schemas
const channelConfigSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  provider: { type: String, enum: ['mock', 'smtp', 'sendgrid', 'mailgun', 'twilio', 'fcm'], default: 'mock' },
  config: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const emailChannelSchema = new mongoose.Schema({
  ...channelConfigSchema.obj,
  fromEmail: { type: String, trim: true }
}, { _id: false });

const smsChannelSchema = new mongoose.Schema({
  ...channelConfigSchema.obj,
  fromNumber: { type: String, trim: true }
}, { _id: false });

// Notification event schema
const notificationEventSchema = new mongoose.Schema({
  email: { type: Boolean, default: true },
  sms: { type: Boolean, default: false },
  push: { type: Boolean, default: false },
  recipients: [{ type: String }]
}, { _id: false });

// Settings schema
const settingsSchema = new mongoose.Schema(
  {
    ownerId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true,
      unique: true
    },
    
    // General settings
    general: {
      notificationEmail: { 
        type: String, 
        trim: true,
        validate: {
          validator: function(v) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
          },
          message: props => `${props.value} is not a valid email address!`
        }
      },
      defaultCurrency: { 
        type: String, 
        enum: ['USD', 'EUR', 'GBP', 'LKR', 'INR'],
        default: 'LKR'
      },
      timezone: { 
        type: String, 
        default: 'Asia/Colombo'
      }
    },
    
    // Appearance settings
    appearance: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'light'
      },
      primaryColor: {
        type: String,
        default: '#0ea5e9',
        validate: {
          validator: function(v) {
            return /^#[0-9A-Fa-f]{6}$/.test(v);
          },
          message: props => `${props.value} is not a valid hex color!`
        }
      },
      accentColor: {
        type: String,
        default: '#8b5cf6',
        validate: {
          validator: function(v) {
            return /^#[0-9A-Fa-f]{6}$/.test(v);
          },
          message: props => `${props.value} is not a valid hex color!`
        }
      },
      fontFamily: {
        type: String,
        enum: ['Inter', 'Roboto', 'Open Sans', 'System UI', 'Arial', 'Helvetica'],
        default: 'Inter'
      },
      logoUrl: {
        type: String,
        trim: true
      },
      faviconUrl: {
        type: String,
        trim: true
      },
      compactMode: {
        type: Boolean,
        default: false
      }
    },
    
    // Notification settings
    notifications: {
      channels: {
        email: emailChannelSchema,
        sms: smsChannelSchema,
        push: channelConfigSchema
      },
      events: {
        bookingCreated: notificationEventSchema,
        bookingCanceled: notificationEventSchema,
        eventUpdated: notificationEventSchema,
        eventReminderHrs: {
          hoursBefore: { type: Number, default: 24 },
          email: { type: Boolean, default: true },
          push: { type: Boolean, default: false }
        },
        lowInventory: {
          threshold: { type: Number, default: 10 },
          email: { type: Boolean, default: true }
        },
        systemAlerts: {
          email: { type: Boolean, default: true }
        }
      },
      preferences: {
        quietHours: {
          start: { type: String, default: '22:00' },
          end: { type: String, default: '08:00' },
          timezone: { type: String, default: 'Asia/Colombo' }
        },
        digest: {
          enabled: { type: Boolean, default: false },
          frequency: {
            type: String,
            enum: ['daily', 'weekly'],
            default: 'daily'
          },
          hour: { type: Number, min: 0, max: 23, default: 9 }
        }
      }
    },
    
    // Security settings
    security: {
      twoFactor: {
        enabled: { type: Boolean, default: false },
        type: { type: String, enum: ['totp'], default: 'totp' },
        otpauthUrl: String,
        secret: String,
        recoveryCodes: [String]
      },
      passwordPolicy: {
        minLength: { type: Number, min: 6, max: 32, default: 8 },
        requireUpper: { type: Boolean, default: true },
        requireLower: { type: Boolean, default: true },
        requireNumber: { type: Boolean, default: true },
        requireSymbol: { type: Boolean, default: false }
      },
      sessionPolicy: {
        maxSessions: { type: Number, min: 1, max: 50, default: 5 },
        ttlHours: { type: Number, min: 1, max: 720, default: 24 },
        forceReauthSensitive: { type: Boolean, default: true }
      },
      ipAllowlist: [String],
      loginAlerts: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: false }
      }
    }
  },
  { timestamps: true }
);

// Set defaults for nested objects
settingsSchema.pre('save', function(next) {
  // Ensure channels have defaults
  if (!this.notifications?.channels?.email) {
    this.notifications = {
      ...this.notifications,
      channels: {
        ...this.notifications?.channels,
        email: { enabled: false, provider: 'mock', fromEmail: '' }
      }
    };
  }
  
  // Ensure notification events have defaults
  if (!this.notifications?.events?.bookingCreated) {
    const defaultEvent = { email: true, sms: false, push: false, recipients: [] };
    this.notifications = {
      ...this.notifications,
      events: {
        ...this.notifications?.events,
        bookingCreated: defaultEvent,
        bookingCanceled: defaultEvent,
        eventUpdated: defaultEvent
      }
    };
  }
  
  next();
});

export default mongoose.model('Settings', settingsSchema);
