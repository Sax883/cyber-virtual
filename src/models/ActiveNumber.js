const mongoose = require('mongoose');

const codeEntrySchema = new mongoose.Schema({
  message: { type: String, required: true },
  verificationText: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const activeNumberSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  service_name: {
    type: String,
    required: true,
  },
  phone_number: {
    type: String,
    required: true,
  },
  masked_phone_number: {
    type: String,
    default: '',
  },
  revealed: {
    type: Boolean,
    default: false,
  },
  activation_id: {
    type: String,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'expired'],
    default: 'active',
  },
  received_codes: [codeEntrySchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
});

module.exports = mongoose.model('ActiveNumber', activeNumberSchema);
