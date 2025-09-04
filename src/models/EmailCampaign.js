import mongoose from 'mongoose';

const statsSchema = new mongoose.Schema({
  sent: { type: Number, default: 0 },
  delivered: { type: Number, default: 0 },
  opens: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  bounces: { type: Number, default: 0 }
}, { _id: false });

const segmentSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['all', 'checked', 'not_checked'],
    default: 'all'
  },
  interests: [{ type: String }],
  locations: [{ type: String }],
  minAge: { type: Number, min: 0, max: 120 },
  maxAge: { type: Number, min: 0, max: 120 }
}, { _id: false });

const emailCampaignSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketingCampaign',
    required: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  templateHtml: {
    type: String,
    required: true
  },
  fromEmail: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  segment: {
    type: segmentSchema,
    default: () => ({})
  },
  status: {
    type: String,
    enum: ['Draft', 'Queued', 'Sending', 'Sent', 'Failed'],
    default: 'Draft'
  },
  provider: {
    type: String,
    enum: ['mock', 'sendgrid', 'mailgun'],
    default: 'mock'
  },
  stats: {
    type: statsSchema,
    default: () => ({})
  },
  scheduledAt: {
    type: Date
  },
  sentAt: {
    type: Date
  },
  recipients: {
    count: { type: Number, default: 0 },
    processed: { type: Number, default: 0 }
  },
  trackingEnabled: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Indexes
emailCampaignSchema.index({ campaignId: 1 });
emailCampaignSchema.index({ status: 1 });
emailCampaignSchema.index({ scheduledAt: 1 });

export default mongoose.model('EmailCampaign', emailCampaignSchema);
