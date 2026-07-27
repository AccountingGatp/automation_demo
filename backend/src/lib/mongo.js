const mongoose = require('mongoose');

let connectPromise = null;

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[mongo] MONGODB_URI not set, sync logs are disabled');
    return null;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectPromise) {
    connectPromise = mongoose
      .connect(uri, {
        dbName: process.env.MONGODB_DB || undefined,
      })
      .then(() => {
        console.log('[mongo] connected');
        return mongoose.connection;
      })
      .catch((err) => {
        connectPromise = null;
        console.error('[mongo] connection failed:', err.message || err);
        throw err;
      });
  }

  return connectPromise;
}

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = {
  connectMongo,
  isMongoReady,
};
