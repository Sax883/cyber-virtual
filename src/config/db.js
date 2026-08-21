const mongoose = require('mongoose');

let connectionPromise;

function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  if (connectionPromise) return connectionPromise;

  const uri = process.env.MONGODB_URI;
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

module.exports = { connectDB };
