const { isMongoReady } = require('../lib/mongo');
const SyncLog = require('../models/SyncLog');

async function createSyncLog(entry) {
  if (!isMongoReady()) {
    return { skipped: true };
  }

  try {
    const doc = await SyncLog.create(entry);
    return { ok: true, id: doc._id };
  } catch (err) {
    console.error('[sync-log] create failed:', err.message || err);
    return { ok: false, error: err.message };
  }
}

async function listSyncLogs({ status, event, limit = 50 } = {}) {
  if (!isMongoReady()) {
    return { data: [], mongoReady: false };
  }

  const query = {};
  if (status) query.status = status;
  if (event) query.event = event;

  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const data = await SyncLog.find(query).sort({ createdAt: -1 }).limit(safeLimit).lean();

  return { data, mongoReady: true };
}

module.exports = {
  createSyncLog,
  listSyncLogs,
};
