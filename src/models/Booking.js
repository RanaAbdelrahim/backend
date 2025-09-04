import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    seats: [{ type: String, required: true }],
    pricePaid: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'paid', 'checked-in', 'cancelled'], default: 'paid' },
    qrData: { type: String },
    checkInTime: { type: Date },
    sourceCampaign: { type: String },
    referrer: { type: String },
    // Add the following fields for better marketing attribution
    utmSource: { type: String },
    utmMedium: { type: String },
    utmContent: { type: String }
  },
  { timestamps: true }
);

bookingSchema.index({ sourceCampaign: 1, createdAt: 1 });
bookingSchema.index({ utmSource: 1, utmMedium: 1 });

export default mongoose.model('Booking', bookingSchema);
