const { connectMongo, isMongoReady } = require('../lib/mongo');
const SyncLog = require('../models/SyncLog');

async function ensureMongo() {
  await connectMongo();
  return isMongoReady();
}

async function createSyncLog(entry) {
  const ready = await ensureMongo();
  if (!ready) {
    console.warn('[sync-log] skipped (mongo not ready)', entry?.status, entry?.message);
    return { skipped: true };
  }

  try {
    const doc = await SyncLog.create({
      ...entry,
      seller: entry.seller || {},
      report: entry.report || {},
      quickbooks: entry.quickbooks || {},
      error: entry.error || {},
      meta: entry.meta || {},
    });
    console.log(`[sync-log] saved ${entry.status} ${entry.event}: ${entry.message}`);
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
      counts: { total: 0, success: 0, failed: 0 },
      message:
        'MongoDB is not connected. Set MONGODB_URI on the backend (Vercel env for production).',
    };
  }

  const query = {};
  if (status) query.status = status;
  if (event) query.event = event;

  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));

  const [data, total, success, failed] = await Promise.all([
    SyncLog.find(query).sort({ createdAt: -1 }).limit(safeLimit).lean(),
    SyncLog.countDocuments({}),
    SyncLog.countDocuments({ status: 'success' }),
    SyncLog.countDocuments({ status: 'failed' }),
  ]);

  return {
    data,
    mongoReady: true,
    counts: { total, success, failed },
  };
}

module.exports = {
  createSyncLog,
  listSyncLogs,
};
