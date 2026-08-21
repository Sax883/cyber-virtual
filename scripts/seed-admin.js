require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function seedAdmin() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cybervirtual');

  const email = process.env.ADMIN_EMAIL || 'admin@cybervirtual.ng';
  const existing = await User.findOne({ email });
  if (existing) {
    console.log('Admin already exists.');
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Power081', 10);
  await User.create({
      name: 'Cyber Virtual Admin',
    email,
    passwordHash,
    creditBalance: 100,
    role: 'admin',
  });

  console.log('Admin user seeded.');
  process.exit(0);
}

seedAdmin().catch((error) => {
  console.error(error);
  process.exit(1);
});
