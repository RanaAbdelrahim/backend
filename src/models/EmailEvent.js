import mongoose from 'mongoose';

const emailEventSchema = new mongoose.Schema({
  emailCampaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmailCampaign',
    required: true
  },
  attendeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  event: {
    type: String,
    enum: ['sent', 'delivered', 'open', 'click', 'bounce'],
    required: true
  },
  ts: {
    type: Date,
    default: Date.now
  },
  url: {
    type: String
  },
  ip: {
    type: String
  },
  userAgent: {
    type: String
  }
}, { timestamps: false });

// Indexes
emailEventSchema.index({ emailCampaignId: 1, attendeeId: 1, event: 1 });
emailEventSchema.index({ ts: 1 });

export default mongoose.model('EmailEvent', emailEventSchema);
