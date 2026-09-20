require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { issueCode } = require('./utils/inviteCodes');

/**
 * Creates the administrator account and the default inspector account.
 *
 * Passwords are never hardcoded here. If DEFAULT_*_PASSWORD is not set in
 * server/.env, a strong random password is generated and printed once. It is
 * stored only as a bcrypt hash.
 */

function randomPassword() {
  // 18 URL-safe characters, then forced to satisfy the password policy.
  const base = crypto.randomBytes(14).toString('base64url').replace(/[^A-Za-z0-9]/g, '');
  return `Lm${base.slice(0, 14)}9#`;
}

function ensureUser({ username, password, name, designation, role }) {
  const existing = db.prepare('SELECT id, role FROM authority_users WHERE username = ?').get(username);

  if (existing) {
    console.log(`  ${role} account "${username}" already exists. Skipping.`);
    return { created: false, id: existing.id };
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO authority_users
      (id, username, passwordHash, name, designation, district, role, isActive, createdVia)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'SEED')
  `).run(id, username, bcrypt.hashSync(password, 10), name, designation, 'Jorhat', role);

  console.log(`  ${role} account created:`);
  console.log(`     username: ${username}`);
  console.log(`     password: ${password}`);
  return { created: true, id };
}

console.log('Seeding authority accounts...');

const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || randomPassword();
const admin = ensureUser({
  username: process.env.DEFAULT_ADMIN_USERNAME || 'lm_admin',
  password: adminPassword,
  name: process.env.DEFAULT_ADMIN_NAME || 'Controller of Legal Metrology',
  designation: 'Controller (Administrator)',
  role: 'ADMIN'
});

const authorityPassword = process.env.DEFAULT_AUTHORITY_PASSWORD || randomPassword();
ensureUser({
  username: process.env.DEFAULT_AUTHORITY_USERNAME || 'authority_admin',
  password: authorityPassword,
  name: process.env.DEFAULT_AUTHORITY_NAME || 'Senior Legal Metrology Inspector',
  designation: 'District Legal Metrology Officer',
  role: 'AUTHORITY'
});

// One starter authentication code so a second inspector can self-register
// immediately after setup without needing the admin UI first.
const outstanding = db
  .prepare(`SELECT COUNT(*) AS c FROM authority_invite_codes WHERE usedAt IS NULL AND revokedAt IS NULL`)
  .get().c;

if (outstanding === 0) {
  const { plainCode } = issueCode({
    issuedBy: admin.id,
    issuedByName: 'Seed script',
    label: 'Initial inspector onboarding code',
    designation: 'Legal Metrology Inspector',
    district: 'Jorhat',
    expiresInDays: 30
  });
  console.log('\n  Authority authentication code (single use, valid 30 days):');
  console.log(`     ${plainCode}`);
  console.log('     Use it on the "Create authority account" screen. It is stored only as a hash.');
} else {
  console.log(`\n  ${outstanding} unused authentication code(s) already outstanding. No new code issued.`);
}

console.log('\nChange these passwords before any real deployment.');
