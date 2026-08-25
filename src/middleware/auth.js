function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  if (req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  return res.redirect('/auth/login');
}

function establishSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.user = user;
      req.session.save((saveError) => {
        if (saveError) return reject(saveError);
        return resolve();
      });
    });
  });
}

function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }

  return res.status(403).json({ message: 'Admin access required.' });
}

module.exports = { ensureAuthenticated, ensureAdmin, establishSession };
