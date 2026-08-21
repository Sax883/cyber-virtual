function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  return res.redirect('/auth/login');
}

function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }

  return res.status(403).json({ message: 'Admin access required.' });
}

module.exports = { ensureAuthenticated, ensureAdmin };
