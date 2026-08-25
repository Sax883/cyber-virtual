const mongoose = require('mongoose');

const boostOrderSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  guestEmail: {
    type: String,
    default: '',
    lowercase: true,
    trim: true,
  },
  platform: {
    type: String,
    enum: ['TikTok', 'Facebook', 'Instagram', 'Snapchat', 'Telegram'],
    required: true,
  },
  service: {
    type: String,
    enum: ['Followers', 'Likes', 'Comments'],
    required: true,
  },
  target: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  quantity: {
    type: Number,
    required: true,
    min: 100,
  },
  credits: {
    type: Number,
    required: true,
    min: 1,
  },
  amount: {
    type: Number,
    required: true,
    min: 1,
  },
  providerRate: {
    type: Number,
    default: 0,
  },
  serviceId: {
    type: Number,
    default: 0,
  },
  providerOrderId: {
    type: String,
    default: '',
    trim: true,
  },
  paymentMethod: {
    type: String,
    enum: ['wallet', 'manual'],
    default: 'manual',
  },
  status: {
    type: String,
    enum: ['pending_payment', 'queued', 'in_progress', 'completed', 'failed', 'cancelled'],
    default: 'queued',
  },
  delivered: {
    type: Number,
    default: 0,
    min: 0,
  },
  startedAt: {
    type: Date,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
  failureReason: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500,
  },
  paymentReference: {
    type: String,
    default: '',
    trim: true,
    maxlength: 200,
  },
  proofOfPayment: {
    type: String,
    default: '',
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

boostOrderSchema.pre('save', function updateTimestamp(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('BoostOrder', boostOrderSchema);
