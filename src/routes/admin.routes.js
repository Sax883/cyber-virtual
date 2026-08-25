const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const SupportMessage = require('../models/SupportMessage');
const { ensureAuthenticated } = require('../middleware/auth');
const { establishSession } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { getOpaySettings } = require('../services/settingsService');
const { getAdminCredentials } = require('../config/admin');
const BoostOrder = require('../models/BoostOrder');

const router = express.Router();

function getTransactionCredits(transaction) {
  if (Number(transaction.credits) > 0) return Number(transaction.credits);
  return { 1000: 1, 3000: 5, 5000: 10 }[Number(transaction.amount)] || 0;
}

router.get('/', (req, res) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return res.redirect('/admin/dashboard');
  }
  return res.redirect('/admin/login');
});

router.get('/login', async (req, res) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return res.redirect('/admin/dashboard');
  }

  res.render('admin', {
    page: 'login',
    user: null,
    users: [],
    transactions: [],
    opaySettings: await getOpaySettings(),
    error: null,
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');
  const adminCredentials = getAdminCredentials();

  if (normalizedEmail !== adminCredentials.email || normalizedPassword !== adminCredentials.password) {
    return res.status(401).render('admin', {
      page: 'login',
      user: null,
      users: [],
      transactions: [],
      opaySettings: await getOpaySettings(),
      error: 'Invalid admin credentials.',
    });
  }

  let adminUser = await User.findOne({ email: normalizedEmail });
  if (!adminUser) {
    const passwordHash = await bcrypt.hash(normalizedPassword, 10);
    adminUser = await User.create({
      name: 'Cyber Virtual Admin',
      email: normalizedEmail,
      passwordHash,
      creditBalance: 0,
      role: 'admin',
    });
  }

  await establishSession(req, {
    id: adminUser._id,
    name: adminUser.name || 'Cyber Virtual Admin',
    email: adminUser.email,
    preferredRegion: adminUser.preferredRegion || '',
    role: 'admin',
    creditBalance: adminUser.creditBalance || 0,
  });

  return res.redirect('/admin/dashboard');
});

router.get('/dashboard', ensureAuthenticated, requireAdmin, async (req, res) => {
  const users = await User.find({ adminHidden: { $ne: true } }).sort({ createdAt: -1 }).lean();
  const visibleUserIds = users.map((entry) => entry._id);
  const transactions = await Transaction.find({ user_id: { $in: visibleUserIds } }).populate('user_id', 'email').sort({ user_id: 1, timestamp: -1 }).limit(100).lean();
  const transactionGroups = transactions.reduce((groups, transaction) => {
    transaction.displayCredits = getTransactionCredits(transaction);
    const clientId = transaction.user_id?._id?.toString() || transaction.user_id?.toString() || 'unknown';
    let group = groups.find((entry) => entry.clientId === clientId);
    if (!group) {
      group = {
        clientId,
        email: transaction.user_id?.email || 'Unknown client',
        transactions: [],
      };
      groups.push(group);
    }
    group.transactions.push(transaction);
    return groups;
  }, []);
  const opaySettings = await getOpaySettings();
  const supportMessages = await SupportMessage.find({ user_id: { $in: visibleUserIds } }).populate('user_id', 'name email').sort({ updatedAt: -1 }).lean();
  const boostOrders = await BoostOrder.find().populate('user_id', 'name email').sort({ createdAt: -1 }).limit(100).lean();

  res.render('admin', {
    page: 'dashboard',
    user: req.session.user,
    users,
    transactions,
    transactionGroups,
    supportMessages,
    boostOrders,
    opaySettings,
    error: null,
  });
});

module.exports = router;
