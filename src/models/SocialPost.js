import mongoose from 'mongoose';

const statsSchema = new mongoose.Schema({
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  comments: { type: Number, default: 0 }
}, { _id: false });

const socialPostSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketingCampaign',
    required: true
  },
  platform: {
    type: String,
    enum: ['facebook', 'twitter', 'instagram'],
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  scheduledAt: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['Draft', 'Queued', 'Posted', 'Failed'],
    default: 'Draft'
  },
  linkUrl: {
    type: String,
    trim: true
  },
  imageUrl: {
    type: String,
    trim: true
  },
  stats: {
    type: statsSchema,
    default: () => ({})
  },
  postedAt: {
    type: Date
  },
  error: {
    type: String
  }
}, { timestamps: true });

// Indexes
socialPostSchema.index({ campaignId: 1 });
socialPostSchema.index({ platform: 1 });
socialPostSchema.index({ status: 1 });
socialPostSchema.index({ scheduledAt: 1 });

export default mongoose.model('SocialPost', socialPostSchema);
