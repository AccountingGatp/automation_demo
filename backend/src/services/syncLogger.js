const { connectMongo, isMongoReady } = require('../lib/mongo');
const SyncLog = require('../models/SyncLog');

async function ensureMongo() {
  await connectMongo();
  return isMongoReady();
}

async function createSyncLog(entry) {
  const ready = await ensureMongo();
  if (!ready) {
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
  const ready = await ensureMongo();
  if (!ready) {
    return {
      data: [],
      mongoReady: false,
      message:
        'MongoDB is not connected. Set MONGODB_URI on the backend (Vercel env for production).',
    };
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
