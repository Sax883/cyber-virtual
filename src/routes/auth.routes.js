const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { getAdminCredentials } = require('../config/admin');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('auth', { user: req.session.user || null, mode: 'login', error: null });
});

router.get('/signup', (req, res) => {
  res.render('auth', { user: req.session.user || null, mode: 'signup', error: null });
});

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).render('auth', { user: req.session.user || null, mode: 'signup', error: 'Name, email, and password are required.' });
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).render('auth', { user: req.session.user || null, mode: 'signup', error: 'Account already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase(),
      passwordHash,
      creditBalance: 0,
      role: 'user',
    });

    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      preferredRegion: user.preferredRegion,
      role: user.role,
      creditBalance: user.creditBalance,
    };

    return res.redirect('/dashboard');
  } catch (error) {
    return res.status(500).render('auth', { user: req.session.user || null, mode: 'signup', error: 'Unable to create account.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');

    const adminCredentials = getAdminCredentials();
    if (normalizedEmail === adminCredentials.email && normalizedPassword === adminCredentials.password) {
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

      req.session.user = {
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        preferredRegion: adminUser.preferredRegion,
        role: 'admin',
        creditBalance: adminUser.creditBalance || 0,
      };
      return res.redirect('/admin');
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).render('auth', { user: req.session.user || null, mode: 'login', error: 'Invalid credentials.' });
    }

    const valid = await bcrypt.compare(normalizedPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).render('auth', { user: req.session.user || null, mode: 'login', error: 'Invalid credentials.' });
    }

    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      preferredRegion: user.preferredRegion,
      role: user.role,
      creditBalance: user.creditBalance,
    };

    return res.redirect('/dashboard');
  } catch (error) {
    return res.status(500).render('auth', { user: req.session.user || null, mode: 'login', error: 'Unable to log in.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;
