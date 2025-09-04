import mongoose from 'mongoose';

const seatSchema = new mongoose.Schema(
  {
    rows: { type: Number, default: 10 },
    cols: { type: Number, default: 12 },
    reserved: [{ type: String }],
    sold: [{ type: String }]
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    date: { type: Date, required: true },
    time: { type: String },
    venue: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    tags: [{ type: String }],
    popularity: { type: String, enum: ['Low', 'Medium', 'High', 'Very High'], default: 'Medium' },
    seatMap: { type: seatSchema, default: () => ({}) },
    status: { type: String, enum: ['upcoming', 'active', 'closed'], default: 'upcoming' },
    bannerUrl: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model('Event', eventSchema);
