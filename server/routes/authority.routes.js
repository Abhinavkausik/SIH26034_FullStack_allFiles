const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuthority } = require('../middleware/auth');
const { REPORTS_DIR } = require('../utils/pdfReport');

const router = express.Router();

// Every route below requires a valid authority JWT (see routes/auth.routes.js)
router.use(requireAuthority);

// GET /api/authority/violations
// Full queue of non-compliant / flagged scans awaiting authority attention.
router.get('/violations', (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT * FROM scans
    WHERE overallStatus IN ('NON_COMPLIANT', 'FLAGGED_REVIEW')
  `;
  const params = [];
  if (status && status !== 'ALL') {
    query += ' AND actionStatus = ?';
    params.push(status);
  }
  query += ' ORDER BY createdAt DESC';

  const rows = db.prepare(query).all(...params).map(hydrateScanRow);
  res.json(rows);
});

// GET /api/authority/violations/:id
router.get('/violations/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM scans WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Scan not found.' });

  const history = db.prepare('SELECT * FROM action_log WHERE scanId = ? ORDER BY timestamp DESC').all(req.params.id);
  res.json({ ...hydrateScanRow(row), actionHistory: history });
});

// POST /api/authority/violations/:id/action
// Body: { action: 'UNDER_REVIEW' | 'NOTICE_ISSUED' | 'RESOLVED', notes?: string }
router.post('/violations/:id/action', (req, res) => {
  const { action, notes } = req.body || {};
  const validActions = ['UNDER_REVIEW', 'NOTICE_ISSUED', 'RESOLVED'];

  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });
  }

  const scan = db.prepare('SELECT id FROM scans WHERE id = ?').get(req.params.id);
  if (!scan) return res.status(404).json({ error: 'Scan not found.' });

  db.prepare('UPDATE scans SET actionStatus = ?, actionNotes = ? WHERE id = ?')
    .run(action, notes || null, req.params.id);

  db.prepare(`
    INSERT INTO action_log (id, scanId, action, notes, actedBy)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), req.params.id, action, notes || null, req.user.name);

  res.json({ success: true, scanId: req.params.id, actionStatus: action });
});

// GET /api/authority/reports/:id  -> downloads the auto-generated PDF for a scan
router.get('/reports/:id', (req, res) => {
  const row = db.prepare('SELECT reportPath, productTitle FROM scans WHERE id = ?').get(req.params.id);
  if (!row || !row.reportPath) {
    return res.status(404).json({ error: 'No report available for this scan.' });
  }
  const fileName = path.basename(row.reportPath);
  const absolutePath = path.join(REPORTS_DIR, fileName);
  res.download(absolutePath, `Compliance-Report-${req.params.id}.pdf`);
});

// GET /api/authority/summary - small KPI set for the portal header
router.get('/summary', (req, res) => {
  const pending = db.prepare(`SELECT COUNT(*) AS c FROM scans WHERE overallStatus IN ('NON_COMPLIANT','FLAGGED_REVIEW') AND actionStatus = 'PENDING'`).get().c;
  const underReview = db.prepare(`SELECT COUNT(*) AS c FROM scans WHERE actionStatus = 'UNDER_REVIEW'`).get().c;
  const noticesIssued = db.prepare(`SELECT COUNT(*) AS c FROM scans WHERE actionStatus = 'NOTICE_ISSUED'`).get().c;
  const resolved = db.prepare(`SELECT COUNT(*) AS c FROM scans WHERE actionStatus = 'RESOLVED'`).get().c;
  res.json({ pending, underReview, noticesIssued, resolved });
});

function hydrateScanRow(row) {
  return {
    ...row,
    checkedFields: JSON.parse(row.checkedFields || '[]'),
    violations: JSON.parse(row.violations || '[]'),
    isFontCompliant: row.isFontCompliant === null ? undefined : !!row.isFontCompliant
  };
}

module.exports = router;
