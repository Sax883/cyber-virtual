require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStoreModule = require('connect-mongo');
const MongoStore = MongoStoreModule.MongoStore || MongoStoreModule.default || MongoStoreModule;
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { connectDB, getMongoUri } = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const adminRoutes = require('./routes/admin.routes');
const purchaseRoutes = require('./routes/purchases.routes');
const apiRoutes = require('./routes/api.routes');

const app = express();

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Request blocked because MongoDB is unavailable:', error.message);
    res.status(503).send('Database service is temporarily unavailable. Please try again shortly.');
  }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../')));
app.use(express.static(path.join(__dirname, '../public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'cybervirtual-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
  store: MongoStore.create({
    mongoUrl: getMongoUri(),
    ttl: 60 * 60 * 24 * 7,
  }),
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please wait a moment and try again.' },
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use('/', dashboardRoutes);
app.use('/api', apiRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/purchases', purchaseRoutes);

app.use((req, res) => {
  res.status(404).render('404', { user: req.session.user || null });
});

module.exports = app;
