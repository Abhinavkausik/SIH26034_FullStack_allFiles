const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { validateUsername, validatePassword } = require('../utils/validate');
const { validateCode, consumeCode } = require('../utils/inviteCodes');

const router = express.Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function issueToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      name: user.name,
      role: user.role === 'ADMIN' ? 'ADMIN' : 'AUTHORITY'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    designation: user.designation,
    district: user.district || null,
    role: user.role === 'ADMIN' ? 'ADMIN' : 'AUTHORITY'
  };
}

// POST /api/auth/authority/login
// Private login for the Authority Portal. This is deliberately not linked
// from the public nav - only someone with real credentials reaches it.
router.post(
  '/authority/login',
  rateLimit({ windowMs: 60000, max: 10, message: 'Too many login attempts. Wait a minute and try again.' }),
  (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = db.prepare('SELECT * FROM authority_users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (user.isActive === 0) {
      return res.status(403).json({ error: 'This authority account has been deactivated.' });
    }

    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    res.json({ token: issueToken(user), user: publicUser(user) });
  }
);

// POST /api/auth/authority/verify-code
// Checks an authority authentication code WITHOUT consuming it, so the UI can
// validate step 1 of registration before asking for a username and password.
router.post(
  '/authority/verify-code',
  rateLimit({ windowMs: 60000, max: 8, message: 'Too many code attempts. Wait a minute and try again.' }),
  (req, res) => {
    const { code } = req.body || {};
    const result = validateCode(code);

    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.reason });
    }

    // Only non-sensitive metadata is echoed back. The code itself is never
    // returned and the hash never leaves the database.
    res.json({
      valid: true,
      designation: result.record.designation || null,
      district: result.record.district || null,
      role: result.record.role
    });
  }
);

// POST /api/auth/authority/register
// Creates a new authority account, but only against a valid, unused,
// unexpired, unrevoked authentication code issued by an administrator.
router.post(
  '/authority/register',
  rateLimit({ windowMs: 60000, max: 6, message: 'Too many registration attempts. Wait a minute and try again.' }),
  (req, res) => {
    const { code, username, password, confirmPassword, name, designation } = req.body || {};

    const codeResult = validateCode(code);
    if (!codeResult.valid) {
      return res.status(400).json({ error: codeResult.reason, field: 'code' });
    }

    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({ error: usernameError, field: 'username' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError, field: 'password' });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: 'The two passwords do not match.', field: 'confirmPassword' });
    }

    if (!name || String(name).trim().length < 3) {
      return res.status(400).json({ error: 'Full name is required.', field: 'name' });
    }

    const cleanUsername = String(username).trim();

    const existing = db.prepare('SELECT id FROM authority_users WHERE username = ?').get(cleanUsername);
    if (existing) {
      return res.status(409).json({ error: 'That Authority User ID is already taken.', field: 'username' });
    }

    const id = uuidv4();
    const record = codeResult.record;

    // Consuming the code and creating the account happen together, so two
    // simultaneous registrations can never both use the same code.
    const create = db.transaction(() => {
      db.prepare(`
        INSERT INTO authority_users
          (id, username, passwordHash, name, designation, district, role, isActive, createdVia, inviteCodeId)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'INVITE_CODE', ?)
      `).run(
        id,
        cleanUsername,
        bcrypt.hashSync(password, 10),
        String(name).trim(),
        designation || record.designation || 'Legal Metrology Inspector',
        record.district || null,
        record.role === 'ADMIN' ? 'ADMIN' : 'AUTHORITY',
        record.id
      );

      // Consumed only after the account row exists, and inside the same
      // transaction, so a failure anywhere rolls the code back to unused.
      const consumed = consumeCode(record.id, id);
      if (!consumed) {
        const err = new Error('This authentication code has just been used. Request a new one.');
        err.status = 409;
        throw err;
      }
    });

    try {
      create();
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Could not create the account.' });
    }

    const user = db.prepare('SELECT * FROM authority_users WHERE id = ?').get(id);

    res.status(201).json({
      success: true,
      message: 'Authority account created. You can now log in with these credentials.',
      token: issueToken(user),
      user: publicUser(user)
    });
  }
);

module.exports = router;
