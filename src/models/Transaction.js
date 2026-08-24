const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  gateway: {
    type: String,
    required: true,
    default: 'manual',
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  },
  credits: {
    type: Number,
    default: 0,
  },
  creditsApplied: {
    type: Boolean,
    default: false,
  },
  referralCreditApplied: {
    type: Boolean,
    default: false,
  },
  package_name: {
    type: String,
    default: '',
  },
  service_name: {
    type: String,
    default: '',
  },
  country: {
    type: String,
    default: '',
  },
  proof_reference: {
    type: String,
    default: '',
  },
  approved_by: {
    type: String,
    default: '',
  },
  approved_at: {
    type: Date,
    default: null,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Transaction', transactionSchema);
