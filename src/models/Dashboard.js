import mongoose from 'mongoose';

// User Model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true }
});

// Metric Model
const metricSchema = new mongoose.Schema({
  key: { type: String, enum: ['events', 'bookings', 'revenue'], required: true },
  value: { type: Number, required: true },
  suffix: { type: String }
});

// SalesPoint Model
const salesPointSchema = new mongoose.Schema({
  label: { type: String, required: true },
  amount: { type: Number, required: true },
  percent: { type: Number, required: true }
});

// EngagementSlice Model
const engagementSliceSchema = new mongoose.Schema({
  label: { type: String, required: true },
  value: { type: Number, required: true },
  percent: { type: Number, required: true },
  color: { type: String, required: true }
});

// UpcomingEvent Model
const upcomingEventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: String, required: true },
  avatarUrl: { type: String }
});

// Notification Model
const notificationSchema = new mongoose.Schema({
  text: { type: String, required: true },
  meta: { type: String }
});

// SeatMap Model
const seatMapSchema = new mongoose.Schema({
  rows: { type: Number, required: true },
  cols: { type: Number, required: true },
  cells: [{
    r: { type: Number, required: true },
    c: { type: Number, required: true },
    status: { type: String, enum: ['paid', 'reserved', 'empty'], required: true }
  }]
});

// Sales Summary Model (combines total stats with sales points)
const salesSummarySchema = new mongoose.Schema({
  totalRevenue: { type: Number, required: true },
  totalTickets: { type: Number, required: true },
  totalEvents: { type: Number, required: true },
  salesPoints: [salesPointSchema]
});

// Widget Model
const widgetSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['stats', 'chart', 'list', 'calendar', 'custom'],
    required: true
  },
  title: { type: String, required: true },
  dataSource: { type: String, required: true },
  size: { 
    cols: { type: Number, min: 1, max: 12, default: 4 },
    rows: { type: Number, min: 1, max: 4, default: 1 }
  },
  position: {
    x: { type: Number, min: 0, default: 0 },
    y: { type: Number, min: 0, default: 0 }
  },
  config: { type: mongoose.Schema.Types.Mixed },
  isVisible: { type: Boolean, default: true }
}, { _id: true });

const dashboardSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true
  },
  name: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  layout: [widgetSchema],
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Compound index to ensure user can't have multiple default dashboards
dashboardSchema.index({ user: 1, isDefault: 1 }, { 
  unique: true, 
  partialFilterExpression: { isDefault: true } 
});

export const DashboardUser = mongoose.model('DashboardUser', userSchema);
export const Metric = mongoose.model('Metric', metricSchema);
export const SalesPoint = mongoose.model('SalesPoint', salesPointSchema);
export const EngagementSlice = mongoose.model('EngagementSlice', engagementSliceSchema);
export const UpcomingEvent = mongoose.model('UpcomingEvent', upcomingEventSchema);
export const Notification = mongoose.model('DashboardNotification', notificationSchema);
export const SeatMap = mongoose.model('SeatMap', seatMapSchema);
export const SalesSummary = mongoose.model('SalesSummary', salesSummarySchema);
export default mongoose.model('Dashboard', dashboardSchema);
