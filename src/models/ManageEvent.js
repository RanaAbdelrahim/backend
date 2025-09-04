import mongoose from 'mongoose';

const checklistItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  isCompleted: { type: Boolean, default: false },
  dueDate: { type: Date },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String }
}, { timestamps: true });

const staffMemberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role: { type: String, required: true },
  contactInfo: { type: String },
  notes: { type: String }
}, { timestamps: true });

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  service: { type: String, required: true },
  contactPerson: { type: String },
  contactEmail: { type: String },
  contactPhone: { type: String },
  cost: { type: Number },
  notes: { type: String }
}, { timestamps: true });

const manageEventSchema = new mongoose.Schema({
  event: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Event', 
    required: true,
    unique: true
  },
  checklistItems: [checklistItemSchema],
  staffMembers: [staffMemberSchema],
  vendors: [vendorSchema],
  budget: {
    allocated: { type: Number, default: 0 },
    spent: { type: Number, default: 0 },
    notes: { type: String }
  },
  timeline: {
    setupStart: { type: Date },
    eventStart: { type: Date },
    eventEnd: { type: Date },
    breakdownEnd: { type: Date }
  },
  notes: { type: String }
}, { timestamps: true });

export default mongoose.model('ManageEvent', manageEventSchema);
