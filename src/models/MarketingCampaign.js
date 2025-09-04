import mongoose from 'mongoose';
import shortid from 'shortid';

const targetSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['all', 'checked', 'not_checked'],
    default: 'all'
  },
  interests: [{ type: String }],
  locations: [{ type: String }],
  minAge: {
    type: Number,
    min: 0,
    max: 120
  },
  maxAge: {
    type: Number,
    min: 0,
    max: 120
  }
}, { _id: false });

const marketingCampaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['Scheduled', 'Active', 'Completed', 'Paused'],
    default: 'Scheduled'
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  },
  startAt: {
    type: Date,
    required: true
  },
  endAt: {
    type: Date,
    required: true,
    validate: {
      validator: function(value) {
        return this.startAt < value;
      },
      message: 'End date must be after start date'
    }
  },
  budget: {
    type: Number,
    min: 0
  },
  target: {
    type: targetSchema,
    default: () => ({})
  },
  utmCode: {
    type: String,
    unique: true,
    default: () => `cmp-${shortid.generate()}`
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  objective: {
    type: String,
    enum: ['awareness', 'consideration', 'conversion'],
    default: 'conversion'
  }
}, { timestamps: true });

// Indexes for efficient querying
marketingCampaignSchema.index({ utmCode: 1 });
marketingCampaignSchema.index({ createdBy: 1 });
marketingCampaignSchema.index({ status: 1 });
marketingCampaignSchema.index({ startAt: 1, endAt: 1 });
marketingCampaignSchema.index({ eventId: 1 });

export default mongoose.model('MarketingCampaign', marketingCampaignSchema);
