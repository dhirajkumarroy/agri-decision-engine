/**
 * Creates the first admin user in MongoDB.
 *
 * Usage:
 *   node scripts/seedAdmin.js
 *   ADMIN_EMAIL=me@email.com ADMIN_PASS=MyPass@123 node scripts/seedAdmin.js
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const User = require('../models/User');

const ADMIN_NAME  = process.env.ADMIN_NAME  || 'Admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@farmpilot.ai';
const ADMIN_PASS  = process.env.ADMIN_PASS  || 'Admin@1234';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/farmpilot_ai');
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log(`Admin already exists: ${ADMIN_EMAIL} (role: ${existing.role})`);
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save({ validateModifiedOnly: true });
      console.log('→ Upgraded to admin role');
    }
    await mongoose.disconnect();
    return;
  }

  const admin = await User.create({
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
    role: 'admin',
  });

  console.log('✅ Admin created successfully');
  console.log(`   Email    : ${admin.email}`);
  console.log(`   Password : ${ADMIN_PASS}`);
  console.log(`   ID       : ${admin._id}`);
  console.log('\n⚠️  Change the password after first login!');

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
