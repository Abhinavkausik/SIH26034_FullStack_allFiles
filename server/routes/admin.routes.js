const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { issueCode, listCodes, revokeCode } = require('../utils/inviteCodes');

const router = express.Router();

// Every route here is administrator-only.
router.use(requireAdmin);

// GET /api/admin/invite-codes
// Lists every issued code with its state. The code value itself is never
// returned - only the hash is stored, and it is shown exactly once at issue.
router.get('/invite-codes', (req, res) => {
  res.json(listCodes());
});

// POST /api/admin/invite-codes
// Body: { label?, designation?, district?, role?, expiresInDays? }
router.post('/invite-codes', (req, res) => {
  const { label, designation, district, role, expiresInDays } = req.body || {};

  if (expiresInDays !== undefined && (Number(expiresInDays) <= 0 || Number(expiresInDays) > 365)) {
    return res.status(400).json({ error: 'expiresInDays must be between 1 and 365.' });
  }

  const { record, plainCode } = issueCode({
    issuedBy: req.user.sub,
    issuedByName: req.user.name,
    label,
    designation,
    district,
    role,
    expiresInDays: expiresInDays === undefined ? 14 : Number(expiresInDays)
  });

  res.status(201).json({
    ...record,
    code: plainCode,
    notice: 'Copy this code now. It is stored only as a hash and cannot be shown again.'
  });
});

// DELETE /api/admin/invite-codes/:id
router.delete('/invite-codes/:id', (req, res) => {
  const updated = revokeCode(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Code not found.' });
  res.json(updated);
});

// GET /api/admin/authority-users
router.get('/authority-users', (req, res) => {
  const rows = db.prepare(`
    SELECT id, username, name, designation, district, role, isActive, createdVia, createdAt
    FROM authority_users ORDER BY createdAt DESC
  `).all();
  res.json(rows.map((r) => ({ ...r, isActive: !!r.isActive })));
});

// PATCH /api/admin/authority-users/:id  Body: { isActive: boolean }
router.patch('/authority-users/:id', (req, res) => {
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive (boolean) is required.' });
  }
  if (req.params.id === req.user.sub && isActive === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own administrator account.' });
  }

  const info = db.prepare('UPDATE authority_users SET isActive = ? WHERE id = ?')
    .run(isActive ? 1 : 0, req.params.id);

  if (info.changes === 0) return res.status(404).json({ error: 'Authority user not found.' });
  res.json({ success: true, id: req.params.id, isActive });
});

module.exports = router;
