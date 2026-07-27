const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
      enum: ['export', 'quickbooks', 'sync', 'slack'],
    },
    status: {
      type: String,
      required: true,
      enum: ['started', 'success', 'failed', 'warning'],
    },
    flow: {
      type: String,
      default: 'manual',
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    seller: {
      id: String,
      name: String,
    },
    report: {
      type: String,
      from: String,
      to: String,
      rowCount: Number,
      sheetNames: [String],
    },
    quickbooks: {
      status: String,
      journalId: String,
      lineCount: Number,
    },
    error: {
      message: String,
      stack: String,
    },
    meta: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.SyncLog || mongoose.model('SyncLog', syncLogSchema);
