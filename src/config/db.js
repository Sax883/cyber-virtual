const mongoose = require('mongoose');

let connectionPromise;

function getMongoUri() {
  const configuredUri = String(process.env.MONGODB_URI || '').trim();
  const uri = configuredUri.replace(/^MONGODB_URI\s*=\s*/i, '').replace(/^(['"])(.*)\1$/, '$2').trim();
  return uri;
}

function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  if (connectionPromise) return connectionPromise;

  const uri = getMongoUri();
  if (!uri) {
    return Promise.reject(new Error('MONGODB_URI is not configured.'));
  }

  connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    })
    .then(() => {
      console.log('MongoDB connected successfully');
      return mongoose.connection;
    })
    .catch((error) => {
      connectionPromise = null;
      console.error('MongoDB connection failed:', error.message);
      throw error;
    });

  return connectionPromise;
}

module.exports = { connectDB, getMongoUri };
