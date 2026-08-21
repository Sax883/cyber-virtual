const express = require('express');
const User = require('../models/User');
const ActiveNumber = require('../models/ActiveNumber');
const SupportMessage = require('../models/SupportMessage');
const Transaction = require('../models/Transaction');
const { ensureAuthenticated } = require('../middleware/auth');
const { getOpaySettings } = require('../services/settingsService');

const router = express.Router();

const defaultPricing = [
  { credits: 1, amount: 1000, label: 'Starter', badge: null },
  { credits: 5, amount: 3000, label: 'Value', badge: 'Save 10%' },
  { credits: 10, amount: 5000, label: 'Max', badge: 'Best Value' },
];

const defaultOpaySettings = {
  bank: 'OPay',
  accountNumber: '9065781267',
  accountName: 'Gods power okpara chibueze',
};

const countryPricing = {
  USA: { standard: 8, premium: 15 },
  UK: { standard: 8, premium: 15 },
  Canada: { standard: 8, premium: 15 },
  Ghana: 7,
  Kenya: 6,
  SouthAfrica: 8,
  India: 5,
  Germany: 13,
  France: 9,
  Brazil: 11,
  Australia: 10,
  Japan: 12,
  SouthKorea: 11,
  Italy: 10,
  Spain: 9,
  Netherlands: 10,
  Sweden: 9,
  Switzerland: 11,
  Mexico: 8,
  Argentina: 7,
  Colombia: 6,
  Indonesia: 5,
  Malaysia: 7,
  Philippines: 6,
  Vietnam: 5,
  Singapore: 9,
  UAE: 10,
  SaudiArabia: 9,
  Egypt: 7,
  NewZealand: 11,
};

function isValidObjectId(value) {
  return /^[0-9a-fA-F]{24}$/.test(String(value || ''));
}

async function getCurrentUser(req) {
  if (!req.session || !req.session.user) return null;
  if (isValidObjectId(req.session.user.id)) {
    return User.findById(req.session.user.id).lean();
  }
  return User.findOne({ email: req.session.user.email }).lean();
}

function getCountryOptions() {
  return [
    'USA', 'UK', 'Canada', 'India', 'Germany', 'France', 'Brazil', 'Ghana', 'Kenya', 'South Africa', 'Australia', 'Japan', 'South Korea', 'Italy', 'Spain', 'Netherlands', 'Sweden', 'Switzerland', 'Mexico', 'Argentina', 'Colombia', 'Indonesia', 'Malaysia', 'Philippines', 'Vietnam', 'Singapore', 'UAE', 'Saudi Arabia', 'Egypt', 'New Zealand', 'Nigeria', 'Turkey', 'Portugal', 'Norway', 'Poland'
  ];
}

router.get('/', async (req, res) => {
  res.render('homepage', {
    user: req.session?.user || null,
    countries: getCountryOptions(),
    pricing: countryPricing,
  });
});

async function renderDashboard(req, res, page = 'services') {
  try {
    const user = await getCurrentUser(req);
    const activeNumbers = isValidObjectId(req.session.user.id)
      ? await ActiveNumber.find({ user_id: req.session.user.id }).sort({ createdAt: -1 }).lean()
      : [];

    const opaySettings = await getOpaySettings();
    const supportMessages = await SupportMessage.find({ user_id: req.session.user.id }).sort({ createdAt: -1 }).lean();
    const transactions = req.session && req.session.user && isValidObjectId(req.session.user.id)
      ? await Transaction.find({ user_id: req.session.user.id }).sort({ timestamp: -1 }).limit(10).lean()
      : [];

    res.render('dashboard', {
      user: { ...req.session.user, name: user?.name || req.session.user.name || '', preferredRegion: user?.preferredRegion || '', creditBalance: user ? user.creditBalance : 0 },
      activeNumbers,
      page,
      opaySettings,
      pricing: defaultPricing,
      countries: getCountryOptions(),
      supportMessages,
      countryPricing,
      transactions,
    });
  } catch (error) {
    res.status(500).render('dashboard', {
      user: req.session.user || null,
      activeNumbers: [],
      page,
      opaySettings: defaultOpaySettings,
      pricing: defaultPricing,
      countries: getCountryOptions(),
      supportMessages: [],
      countryPricing,
      transactions: [],
      error: 'Unable to load dashboard.'
    });
  }
}

router.get('/dashboard', ensureAuthenticated, (req, res) => renderDashboard(req, res, 'services'));
router.get('/dashboard/services', ensureAuthenticated, (req, res) => renderDashboard(req, res, 'services'));
router.get('/dashboard/numbers', ensureAuthenticated, (req, res) => renderDashboard(req, res, 'active'));
router.get('/dashboard/purchases', ensureAuthenticated, (req, res) => renderDashboard(req, res, 'purchases'));
router.get('/dashboard/profile', ensureAuthenticated, (req, res) => renderDashboard(req, res, 'profile'));
router.get('/dashboard/support', ensureAuthenticated, (req, res) => renderDashboard(req, res, 'support'));

router.get('/numbers', ensureAuthenticated, (req, res) => res.redirect('/dashboard/numbers'));
router.get('/purchases', ensureAuthenticated, (req, res) => res.redirect('/dashboard/purchases'));
router.get('/profile', ensureAuthenticated, (req, res) => res.redirect('/dashboard/profile'));

module.exports = router;
