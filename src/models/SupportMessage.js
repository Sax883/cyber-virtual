const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sender: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  subject: {
    type: String,
    default: 'General support',
  },
  message: {
    type: String,
    required: true,
  },
  reply: {
    type: String,
    default: '',
  },
  messages: [{
    sender: {
      type: String,
      enum: ['user', 'admin'],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  status: {
    type: String,
    enum: ['open', 'pending', 'resolved'],
    default: 'open',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

supportMessageSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('SupportMessage', supportMessageSchema);
