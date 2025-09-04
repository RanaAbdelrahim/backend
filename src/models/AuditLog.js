import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action: {
      type: String,
      required: true,
      enum: ['settings.update', 'settings.2fa.enable', 'settings.2fa.disable', 'settings.session.revoke']
    },
    section: {
      type: String,
      enum: ['general', 'appearance', 'notifications', 'security']
    },
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
    ts: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: false }
);

// Index for efficient querying
auditLogSchema.index({ actorId: 1, ts: -1 });
auditLogSchema.index({ action: 1 });

export default mongoose.model('AuditLog', auditLogSchema);
