const express = require('express');
const User = require('../models/User');
const ActiveNumber = require('../models/ActiveNumber');
const Transaction = require('../models/Transaction');
const SupportMessage = require('../models/SupportMessage');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const { buyNumber, getServiceAvailability, getCode } = require('../services/smsService');
const { getOpaySettings, setSetting } = require('../services/settingsService');

const router = express.Router();

function getTransactionCredits(transaction) {
  if (Number(transaction.credits) > 0) return Number(transaction.credits);
  return { 1000: 1, 3000: 5, 5000: 10 }[Number(transaction.amount)] || 0;
}

function ensureThreadMessages(supportMessage) {
  if (supportMessage.messages.length === 0 && supportMessage.message) {
    supportMessage.messages.push({ sender: 'user', message: supportMessage.message, createdAt: supportMessage.createdAt });
  }
}

const COUNTRY_CREDIT_RULES = {
  USA: { standard: 8, premium: 15 },
  UK: { standard: 8, premium: 15 },
  Canada: { standard: 8, premium: 15 },
  Ghana: 7,
  India: 5,
  Germany: 13,
  France: 9,
  Brazil: 11,
};

function isValidObjectId(value) {
  return /^[0-9a-fA-F]{24}$/.test(String(value || ''));
}

function maskPhoneNumber(phoneNumber = '') {
  const value = String(phoneNumber || '').trim();
  if (!value) return '';
  if (value.length <= 6) return value;
  const visibleCount = Math.max(4, Math.ceil(value.length / 2));
  return `${value.slice(0, visibleCount).replace(/\d/g, 'x')}${value.slice(visibleCount)}`;
}

function getRequiredCredits(country, premium) {
  const normalized = String(country || 'USA').trim();
  if (COUNTRY_CREDIT_RULES[normalized]) {
    const rule = COUNTRY_CREDIT_RULES[normalized];
    if (typeof rule === 'object') {
      return premium ? rule.premium : rule.standard;
    }
    return rule;
  }

  return Math.floor(Math.random() * 13) + 3;
}

router.get('/me', ensureAuthenticated, async (req, res) => {
  const user = await User.findById(req.session.user.id).lean();

  res.json({
    user: {
      id: user ? user._id : req.session.user.id,
      name: user ? user.name : req.session.user.name,
      email: user ? user.email : req.session.user.email,
      preferredRegion: user ? user.preferredRegion : req.session.user.preferredRegion,
      role: user ? user.role : req.session.user.role,
      creditBalance: user ? user.creditBalance : 0,
    },
  });
});

router.get('/me/transactions', ensureAuthenticated, async (req, res) => {
  const transactions = await Transaction.find({ user_id: req.session.user.id })
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();
  return res.json(transactions);
});

router.put('/me/profile', ensureAuthenticated, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const preferredRegion = String(req.body.preferredRegion || '').trim();
  if (!name) return res.status(400).json({ message: 'Name is required.' });

  const user = await User.findByIdAndUpdate(
    req.session.user.id,
    { name, preferredRegion },
    { new: true, runValidators: true }
  ).lean();

  if (!user) return res.status(404).json({ message: 'User not found.' });
  req.session.user.name = user.name;
  req.session.user.preferredRegion = user.preferredRegion;
  return res.json({ success: true, user: { name: user.name, preferredRegion: user.preferredRegion } });
});

router.get('/support/messages', ensureAuthenticated, async (req, res) => {
  const messages = await SupportMessage.find({ user_id: req.session.user.id }).sort({ updatedAt: -1 }).lean();
  return res.json(messages);
});

router.post('/support/messages', ensureAuthenticated, async (req, res) => {
  const subject = String(req.body.subject || 'General support').trim();
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ message: 'Message is required.' });

  const supportMessage = await SupportMessage.create({
    user_id: req.session.user.id,
    subject: subject || 'General support',
    message,
    messages: [{ sender: 'user', message }],
    status: 'open',
  });
  return res.status(201).json({ success: true, supportMessage });
});

router.post('/support/messages/:id/reply', ensureAuthenticated, async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ message: 'Message is required.' });

  const supportMessage = await SupportMessage.findOne({ _id: req.params.id, user_id: req.session.user.id });
  if (!supportMessage) return res.status(404).json({ message: 'Support conversation not found.' });
  ensureThreadMessages(supportMessage);
  supportMessage.messages.push({ sender: 'user', message });
  supportMessage.status = 'open';
  await supportMessage.save();
  return res.json({ success: true, supportMessage });
});

router.get('/availability/:serviceName', ensureAuthenticated, async (req, res) => {
  const { serviceName } = req.params;
  const available = await getServiceAvailability(serviceName);
  res.json({ available });
});

router.post('/order', ensureAuthenticated, async (req, res) => {
  const { serviceName, country = 'USA', premium = false } = req.body;
  const user = await User.findById(req.session.user.id);

  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const requiredCredits = getRequiredCredits(country, premium);
  if (user.creditBalance < requiredCredits) {
    return res.status(400).json({ message: `Insufficient credits. ${requiredCredits} required.` });
  }

  try {
    const purchase = await buyNumber({
      serviceName,
      premium,
      country,
      avg: 'false',
    });

    if (!purchase.success) {
      return res.status(400).json({ message: purchase.reason || 'Unable to purchase number.' });
    }

    user.creditBalance -= requiredCredits;
    if (!user.name) user.name = user.email.split('@')[0];
    await user.save();
    req.session.user.creditBalance = user.creditBalance;

    const activeNumber = await ActiveNumber.create({
      user_id: user._id,
      service_name: serviceName,
      phone_number: purchase.phone_number,
      masked_phone_number: maskPhoneNumber(purchase.phone_number),
      revealed: false,
      activation_id: purchase.activation_id,
      status: 'active',
      received_codes: [],
      expiresAt: new Date(Date.now() + 1000 * 60 * 30),
    });

    return res.json({
      success: true,
      activation_id: activeNumber.activation_id,
      phone_number: activeNumber.phone_number,
      masked_phone_number: activeNumber.masked_phone_number,
      service_name: activeNumber.service_name,
      country,
      requiredCredits,
      creditsRemaining: user.creditBalance,
      status: activeNumber.status,
      revealed: activeNumber.revealed,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to process order.', error: error.message });
  }
});

router.get('/numbers', ensureAuthenticated, async (req, res) => {
  const numbers = await ActiveNumber.find({ user_id: req.session.user.id }).sort({ createdAt: -1 });
  res.json(numbers);
});

router.get('/numbers/:id/status', ensureAuthenticated, async (req, res) => {
  const activeNumber = await ActiveNumber.findOne({
    _id: req.params.id,
    user_id: req.session.user.id,
  });

  if (!activeNumber) {
    return res.status(404).json({ message: 'Number not found.' });
  }

  const codeState = await getCode(activeNumber.activation_id);
  if (codeState.status === 'received' && !activeNumber.received_codes.some(item => item.verificationText === codeState.verificationText)) {
    activeNumber.received_codes.push({
      message: codeState.message,
      verificationText: codeState.verificationText,
      timestamp: new Date(),
    });
    activeNumber.status = 'completed';
    await activeNumber.save();
  }

  return res.json({
    activation_id: activeNumber.activation_id,
    status: activeNumber.status,
    smsStatus: codeState.status,
    revealed: activeNumber.revealed,
    masked_phone_number: activeNumber.masked_phone_number,
    phone_number: activeNumber.phone_number,
    received_codes: activeNumber.received_codes,
  });
});

router.post('/numbers/:id/reveal', ensureAuthenticated, async (req, res) => {
  const activeNumber = await ActiveNumber.findOne({
    _id: req.params.id,
    user_id: req.session.user.id,
  });

  if (!activeNumber) {
    return res.status(404).json({ message: 'Number not found.' });
  }

  activeNumber.revealed = true;
  await activeNumber.save();

  return res.json({
    success: true,
    revealed: true,
    phone_number: activeNumber.phone_number,
    masked_phone_number: activeNumber.masked_phone_number,
  });
});

router.get('/admin/users', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const users = await User.find({ adminHidden: { $ne: true } }).select('name email preferredRegion role creditBalance createdAt').sort({ createdAt: -1 });
  res.json(users);
});

router.delete('/admin/users/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  if (String(req.params.id) === String(req.session.user.id)) {
    return res.status(400).json({ message: 'The administrator account cannot be hidden.' });
  }

  const user = await User.findById(req.params.id);
  if (user?.email?.toLowerCase() === 'admin@cybervirtual.ng' || user?.role === 'admin') {
    return res.status(400).json({ message: 'The administrator account cannot be hidden.' });
  }
  if (user) user.adminHidden = true;
  await user?.save();
  if (!user) return res.status(404).json({ message: 'Client not found.' });
  return res.json({ success: true, message: 'Client hidden from the admin dashboard.' });
});

router.get('/admin/support', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const visibleUsers = await User.find({ adminHidden: { $ne: true } }).select('_id').lean();
  const messages = await SupportMessage.find({ user_id: { $in: visibleUsers.map((user) => user._id) } }).populate('user_id', 'name email').sort({ updatedAt: -1 }).lean();
  return res.json(messages);
});

router.delete('/admin/support/user/:userId', ensureAuthenticated, ensureAdmin, async (req, res) => {
  if (!req.params.userId) {
    return res.status(400).json({ message: 'Client id is required.' });
  }

  const deleted = await SupportMessage.deleteMany({ user_id: req.params.userId });
  if (!deleted.deletedCount) {
    return res.status(404).json({ message: 'No support chats found for this client.' });
  }

  return res.json({ success: true, message: 'Client support chats deleted.', deletedCount: deleted.deletedCount });
});

router.delete('/admin/support/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const deleted = await SupportMessage.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Support conversation not found.' });
  return res.json({ success: true, message: 'Support conversation deleted.' });
});

router.post('/admin/support/:id/reply', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const message = String(req.body.message || '').trim();
  const status = ['open', 'pending', 'resolved'].includes(req.body.status) ? req.body.status : 'pending';
  if (!message) return res.status(400).json({ message: 'Reply is required.' });

  const supportMessage = await SupportMessage.findById(req.params.id);
  if (!supportMessage) return res.status(404).json({ message: 'Support conversation not found.' });
  ensureThreadMessages(supportMessage);
  supportMessage.reply = message;
  supportMessage.messages.push({ sender: 'admin', message });
  supportMessage.status = status;
  await supportMessage.save();
  return res.json({ success: true, supportMessage });
});

router.get('/admin/opay-settings', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const settings = await getOpaySettings();
  res.json(settings);
});

router.post('/admin/settings/opay', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { bank, accountNumber, accountName } = req.body;

  await setSetting('opay_bank', String(bank || 'OPay'));
  await setSetting('opay_account_number', String(accountNumber || '9065781267'));
  await setSetting('opay_account_name', String(accountName || 'Gods power okpara chibueze'));

  res.json({ success: true, message: 'OPay settings updated.' });
});

router.get('/admin/transactions', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const visibleUsers = await User.find({ adminHidden: { $ne: true } }).select('_id').lean();
  const transactions = await Transaction.find({ user_id: { $in: visibleUsers.map((user) => user._id) } }).populate('user_id', 'email').sort({ timestamp: -1 });
  res.json(transactions);
});

router.post('/admin/transactions/:id/approve', ensureAuthenticated, ensureAdmin, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid transaction ID.' });
  }

  const transaction = await Transaction.findById(req.params.id).populate('user_id', 'email');

  if (!transaction) {
    return res.status(404).json({ message: 'Transaction not found.' });
  }

  if (transaction.status !== 'pending') {
    return res.status(400).json({ message: 'Only pending transactions can be approved.' });
  }

  if (transaction.creditsApplied) {
    return res.json({ success: true, message: 'Transaction already approved.', balance: transaction.user_id?.creditBalance || 0 });
  }

  const user = await User.findById(transaction.user_id?._id || transaction.user_id);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const credits = getTransactionCredits(transaction);
  if (!user.name) user.name = user.email.split('@')[0];
  user.creditBalance += credits;
  await user.save();

  transaction.status = 'completed';
  transaction.credits = credits;
  transaction.creditsApplied = true;
  transaction.approved_by = req.session.user.email;
  transaction.approved_at = new Date();
  await transaction.save();

  res.json({
    success: true,
    message: 'Transaction approved and credits added.',
    balance: user.creditBalance,
  });
});

router.post('/admin/transactions/:id/pend', ensureAuthenticated, ensureAdmin, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid transaction ID.' });
  }

  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) return res.status(404).json({ message: 'Transaction not found.' });

  transaction.status = 'pending';
  transaction.approved_by = '';
  transaction.approved_at = null;
  await transaction.save();

  return res.json({ success: true, message: 'Transaction marked as pending.' });
});

router.post('/admin/transactions/:id/fail', ensureAuthenticated, ensureAdmin, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid transaction ID.' });
  }

  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) return res.status(404).json({ message: 'Transaction not found.' });

  transaction.status = 'failed';
  transaction.approved_by = req.session.user.email;
  transaction.approved_at = new Date();
  await transaction.save();

  return res.json({ success: true, message: 'Transaction marked as failed.' });
});

router.delete('/admin/transactions/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const deleted = await Transaction.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Transaction not found.' });
  return res.json({ success: true, message: 'Transaction deleted.' });
});

module.exports = router;
