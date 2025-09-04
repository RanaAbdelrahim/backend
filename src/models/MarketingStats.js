import mongoose from 'mongoose';

const emailStatsSchema = new mongoose.Schema({
  sent: { type: Number, default: 0 },
  delivered: { type: Number, default: 0 },
  opens: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  bounces: { type: Number, default: 0 }
}, { _id: false });

const socialStatsSchema = new mongoose.Schema({
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  engagements: { type: Number, default: 0 }
}, { _id: false });

const marketingStatsSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketingCampaign',
    required: true
  },
  date: {
    type: String,
    required: true,
    // Format: YYYY-MM-DD
    validate: {
      validator: function(v) {
        return /^\d{4}-\d{2}-\d{2}$/.test(v);
      },
      message: props => `${props.value} is not a valid date format (YYYY-MM-DD)!`
    }
  },
  reach: {
    type: Number,
    default: 0
  },
  conversions: {
    type: Number,
    default: 0
  },
  revenue: {
    type: Number,
    default: 0
  },
  email: {
    type: emailStatsSchema,
    default: () => ({})
  },
  social: {
    type: socialStatsSchema,
    default: () => ({})
  }
}, { timestamps: true });

// Make campaignId and date a compound unique index
marketingStatsSchema.index({ campaignId: 1, date: 1 }, { unique: true });

export default mongoose.model('MarketingStats', marketingStatsSchema);
