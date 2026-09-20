/**
 * Authority authentication codes.
 *
 * Design notes:
 * - There is no universal hardcoded code. Every code is a distinct random
 *   value issued by an ADMIN account and stored only as a bcrypt hash.
 * - The plaintext code is returned exactly once, at issue time, and can never
 *   be read back out of the API or the database.
 * - Codes are single use: consumption happens inside the same transaction that
 *   creates the authority account, so two simultaneous registrations cannot
 *   both consume one code.
 * - Codes carry an optional expiry and can be revoked.
 *
 * A short non-secret prefix is stored alongside the hash purely so validation
 * does not have to bcrypt-compare against every outstanding code.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters
const CODE_GROUPS = 3;
const GROUP_LENGTH = 4;

function randomGroup() {
  let out = '';
  for (let i = 0; i < GROUP_LENGTH; i += 1) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return out;
}

/** e.g. LMPC-7K4Q-Z8MT-D3RW */
function generatePlainCode() {
  const groups = [];
  for (let i = 0; i < CODE_GROUPS; i += 1) groups.push(randomGroup());
  return `LMPC-${groups.join('-')}`;
}

function prefixOf(code) {
  return String(code).trim().toUpperCase().slice(0, 9); // "LMPC-7K4Q"
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

/**
 * Issues a new code. Returns { record, plainCode } - plainCode is shown once
 * to the issuing admin and never persisted.
 */
function issueCode({ issuedBy, issuedByName, label, designation, district, role = 'AUTHORITY', expiresInDays = 14 }) {
  const plainCode = generatePlainCode();
  const id = uuidv4();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString()
    : null;

  db.prepare(`
    INSERT INTO authority_invite_codes
      (id, codeHash, codePrefix, label, designation, district, role, issuedBy, issuedByName, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    bcrypt.hashSync(plainCode, 10),
    prefixOf(plainCode),
    label || null,
    designation || null,
    district || null,
    role === 'ADMIN' ? 'ADMIN' : 'AUTHORITY',
    issuedBy || null,
    issuedByName || null,
    expiresAt
  );

  return { record: getCodeRecord(id), plainCode };
}

function getCodeRecord(id) {
  const row = db.prepare('SELECT * FROM authority_invite_codes WHERE id = ?').get(id);
  return row ? publicCodeShape(row) : null;
}

/** Never exposes codeHash. */
function publicCodeShape(row) {
  const now = new Date();
  let state = 'ACTIVE';
  if (row.revokedAt) state = 'REVOKED';
  else if (row.usedAt) state = 'USED';
  else if (row.expiresAt && new Date(row.expiresAt) < now) state = 'EXPIRED';

  return {
    id: row.id,
    label: row.label,
    designation: row.designation,
    district: row.district,
    role: row.role,
    issuedByName: row.issuedByName,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    usedBy: row.usedBy,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    state
  };
}

function listCodes() {
  return db
    .prepare('SELECT * FROM authority_invite_codes ORDER BY createdAt DESC')
    .all()
    .map(publicCodeShape);
}

/**
 * Validates a plaintext code without consuming it.
 * Returns { valid, reason, record } - `record` is only present when valid.
 */
function validateCode(plainCode) {
  const code = normalizeCode(plainCode);
  if (!code) return { valid: false, reason: 'An authority authentication code is required.' };

  const candidates = db
    .prepare('SELECT * FROM authority_invite_codes WHERE codePrefix = ?')
    .all(prefixOf(code));

  const match = candidates.find((row) => bcrypt.compareSync(code, row.codeHash));

  if (!match) {
    return { valid: false, reason: 'This authentication code was not recognised.' };
  }
  if (match.revokedAt) {
    return { valid: false, reason: 'This authentication code has been revoked by an administrator.' };
  }
  if (match.usedAt) {
    return { valid: false, reason: 'This authentication code has already been used to create an account.' };
  }
  if (match.expiresAt && new Date(match.expiresAt) < new Date()) {
    return { valid: false, reason: 'This authentication code has expired. Request a new one from your administrator.' };
  }

  return { valid: true, record: match };
}

function revokeCode(id) {
  const row = db.prepare('SELECT * FROM authority_invite_codes WHERE id = ?').get(id);
  if (!row) return null;
  if (row.usedAt) return publicCodeShape(row);
  db.prepare(`UPDATE authority_invite_codes SET revokedAt = datetime('now') WHERE id = ?`).run(id);
  return getCodeRecord(id);
}

/**
 * Marks a code consumed. Must be called inside the same transaction as the
 * account insert. The WHERE clause re-checks single-use state so a race
 * between two registrations can only ever let one through.
 */
function consumeCode(codeId, userId) {
  const info = db.prepare(`
    UPDATE authority_invite_codes
    SET usedAt = datetime('now'), usedBy = ?
    WHERE id = ? AND usedAt IS NULL AND revokedAt IS NULL
  `).run(userId, codeId);

  return info.changes === 1;
}

module.exports = {
  issueCode,
  listCodes,
  validateCode,
  revokeCode,
  consumeCode,
  getCodeRecord,
  generatePlainCode,
  prefixOf,
  normalizeCode
};
