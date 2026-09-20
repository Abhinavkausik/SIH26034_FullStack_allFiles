const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuthority } = require('../middleware/auth');
const { REPORTS_DIR } = require('../utils/pdfReport');
const {
  listInspections,
  getInspection,
  changeInspectionStatus,
  refreshPriority,
  INSPECTION_STATUSES
} = require('../utils/inspectionStore');
const { getComplaint, COMPLAINT_STATUSES, CATEGORY_LABELS } = require('./complaint.routes');
const { parsePagination, requireEnum, optionalString } = require('../utils/validate');
const { PRIORITIES } = require('../utils/priority');

const router = express.Router();

// Every route below requires a valid authority JWT (see routes/auth.routes.js)
router.use(requireAuthority);

// ---------------------------------------------------------------------------
// Existing endpoints - unchanged behaviour, kept so the original portal works
// ---------------------------------------------------------------------------

// GET /api/authority/violations
router.get('/violations', (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT * FROM scans
    WHERE overallStatus IN ('NON_COMPLIANT', 'FLAGGED_REVIEW', 'NEEDS_REVIEW')
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
router.post('/violations/:id/action', (req, res) => {
  const { action, notes } = req.body || {};
  const validActions = ['UNDER_REVIEW', 'NOTICE_ISSUED', 'RESOLVED'];

  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });
  }

  const scan = db.prepare('SELECT id, inspectionId FROM scans WHERE id = ?').get(req.params.id);
  if (!scan) return res.status(404).json({ error: 'Scan not found.' });

  db.prepare('UPDATE scans SET actionStatus = ?, actionNotes = ? WHERE id = ?')
    .run(action, notes || null, req.params.id);

  db.prepare(`
    INSERT INTO action_log (id, scanId, action, notes, actedBy)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), req.params.id, action, notes || null, req.user.name);

  // Mirror the action onto the relational inspection record so the new
  // dashboard and the original portal never disagree.
  if (scan.inspectionId) {
    const mapped = action === 'NOTICE_ISSUED' ? 'ACTION_REQUIRED' : action;
    changeInspectionStatus({
      id: scan.inspectionId,
      status: mapped,
      notes: notes || null,
      actedBy: req.user.name
    });
  }

  res.json({ success: true, scanId: req.params.id, actionStatus: action });
});

// GET /api/authority/reports/:id
router.get('/reports/:id', (req, res) => {
  const row = db.prepare('SELECT reportPath, productTitle FROM scans WHERE id = ?').get(req.params.id);
  if (!row || !row.reportPath) {
    return res.status(404).json({ error: 'No report available for this scan.' });
  }
  const fileName = path.basename(row.reportPath);
  const absolutePath = path.join(REPORTS_DIR, fileName);
  res.download(absolutePath, `Compliance-Report-${req.params.id}.pdf`);
});

// GET /api/authority/summary
router.get('/summary', (req, res) => {
  const pending = db.prepare(`SELECT COUNT(*) AS c FROM scans WHERE overallStatus IN ('NON_COMPLIANT','FLAGGED_REVIEW','NEEDS_REVIEW') AND actionStatus = 'PENDING'`).get().c;
  const underReview = db.prepare(`SELECT COUNT(*) AS c FROM scans WHERE actionStatus = 'UNDER_REVIEW'`).get().c;
  const noticesIssued = db.prepare(`SELECT COUNT(*) AS c FROM scans WHERE actionStatus = 'NOTICE_ISSUED'`).get().c;
  const resolved = db.prepare(`SELECT COUNT(*) AS c FROM scans WHERE actionStatus = 'RESOLVED'`).get().c;
  res.json({ pending, underReview, noticesIssued, resolved });
});

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------

// GET /api/authority/inspections
router.get('/inspections', (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);

  const result = listInspections({
    actorType: req.query.actorType,
    complianceStatus: req.query.complianceStatus,
    priority: req.query.priority,
    status: req.query.status,
    assignedTo: req.query.assignedTo === 'me' ? req.user.sub : req.query.assignedTo,
    from: req.query.from,
    to: req.query.to,
    search: req.query.search,
    sort: req.query.sort || 'priority',
    order: req.query.order,
    limit,
    offset
  });

  res.json({ ...result, page, limit });
});

// GET /api/authority/inspections/:id
router.get('/inspections/:id', (req, res) => {
  const inspection = getInspection(req.params.id);
  if (!inspection) return res.status(404).json({ error: 'Inspection not found.' });
  res.json(inspection);
});

// PATCH /api/authority/inspections/:id
// Body: { status?, priority?, notes?, assignTo?: 'me' | <authorityUserId> | null }
router.patch('/inspections/:id', (req, res, next) => {
  try {
    const body = req.body || {};
    const status = body.status ? requireEnum(body.status, INSPECTION_STATUSES, 'status') : null;
    const priority = body.priority ? requireEnum(body.priority, PRIORITIES, 'priority') : null;
    const notes = optionalString(body.notes, 'notes', { max: 2000 });

    let assignedAuthorityId = null;
    if (body.assignTo === 'me') assignedAuthorityId = req.user.sub;
    else if (body.assignTo) assignedAuthorityId = body.assignTo;

    if (assignedAuthorityId) {
      const exists = db.prepare('SELECT id FROM authority_users WHERE id = ?').get(assignedAuthorityId);
      if (!exists) return res.status(400).json({ error: 'Assignee is not a known authority user.' });
    }

    const updated = changeInspectionStatus({
      id: req.params.id,
      status,
      priority,
      notes,
      assignedAuthorityId,
      actedBy: req.user.name
    });

    if (!updated) return res.status(404).json({ error: 'Inspection not found.' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/authority/officers - assignment dropdown
router.get('/officers', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, designation, district, role FROM authority_users
    WHERE isActive = 1 ORDER BY name ASC
  `).all();
  res.json(rows);
});

// ---------------------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------------------

// GET /api/authority/complaints
router.get('/complaints', (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const clauses = [];
  const params = [];

  if (req.query.status && req.query.status !== 'ALL') {
    clauses.push('c.status = ?');
    params.push(req.query.status);
  }
  if (req.query.priority && req.query.priority !== 'ALL') {
    clauses.push('c.priority = ?');
    params.push(req.query.priority);
  }
  if (req.query.category && req.query.category !== 'ALL') {
    clauses.push('c.category = ?');
    params.push(req.query.category);
  }
  if (req.query.search) {
    clauses.push('(p.name LIKE ? OR c.id LIKE ? OR c.description LIKE ?)');
    const like = `%${req.query.search}%`;
    params.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM complaints c LEFT JOIN products p ON p.id = c.productId ${where}
  `).get(...params).c;

  const rows = db.prepare(`
    SELECT c.*, p.name AS productName, p.brand,
           i.complianceStatus, i.priority AS inspectionPriority,
           u.name AS assignedAuthorityName
    FROM complaints c
    LEFT JOIN products p ON p.id = c.productId
    LEFT JOIN inspections i ON i.id = c.inspectionId
    LEFT JOIN authority_users u ON u.id = c.assignedAuthorityId
    ${where}
    ORDER BY CASE c.priority WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC,
             c.createdAt DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    total,
    page,
    limit,
    items: rows.map((r) => ({
      ...r,
      categoryLabel: CATEGORY_LABELS[r.category] || r.category,
      isDemo: !!r.isDemo
    }))
  });
});

// GET /api/authority/complaints/:id - complaint plus the inspection behind it
router.get('/complaints/:id', (req, res) => {
  const complaint = getComplaint(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

  const inspection = complaint.inspectionId ? getInspection(complaint.inspectionId) : null;
  res.json({ ...complaint, inspection });
});

// PATCH /api/authority/complaints/:id  Body: { status?, notes?, assignTo? }
router.patch('/complaints/:id', (req, res, next) => {
  try {
    const body = req.body || {};
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const status = body.status ? requireEnum(body.status, COMPLAINT_STATUSES, 'status') : complaint.status;
    const notes = optionalString(body.notes, 'notes', { max: 2000 });

    let assignedAuthorityId = complaint.assignedAuthorityId;
    if (body.assignTo === 'me') assignedAuthorityId = req.user.sub;
    else if (body.assignTo) assignedAuthorityId = body.assignTo;

    const apply = db.transaction(() => {
      db.prepare(`
        UPDATE complaints SET status = ?, authorityNotes = COALESCE(?, authorityNotes),
               assignedAuthorityId = ?, updatedAt = datetime('now')
        WHERE id = ?
      `).run(status, notes, assignedAuthorityId || null, req.params.id);

      db.prepare(`
        INSERT INTO complaint_events (id, complaintId, fromStatus, toStatus, notes, actedBy)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), req.params.id, complaint.status, status, notes || null, req.user.name);
    });

    apply();

    if (complaint.inspectionId) refreshPriority(complaint.inspectionId);

    res.json(getComplaint(req.params.id));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Feedback review
// ---------------------------------------------------------------------------

// GET /api/authority/feedback
router.get('/feedback', (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const clauses = [];
  const params = [];

  if (req.query.productId) {
    clauses.push('f.productId = ?');
    params.push(req.query.productId);
  }
  if (req.query.maxRating) {
    clauses.push('f.rating <= ?');
    params.push(Number(req.query.maxRating));
  }
  if (req.query.minRating) {
    clauses.push('f.rating >= ?');
    params.push(Number(req.query.minRating));
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM feedback f ${where}`).get(...params).c;

  const rows = db.prepare(`
    SELECT f.id, f.productId, f.inspectionId, f.rating, f.reviewText, f.displayName,
           f.qualityRating, f.packagingRating, f.labelClarityRating, f.overallRating,
           f.createdAt, f.isDemo,
           p.name AS productName, p.brand,
           i.complianceStatus
    FROM feedback f
    LEFT JOIN products p ON p.id = f.productId
    LEFT JOIN inspections i ON i.id = f.inspectionId
    ${where}
    ORDER BY f.createdAt DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const trend = db.prepare(`
    SELECT strftime('%Y-%m', createdAt) AS month, AVG(rating) AS average, COUNT(*) AS count
    FROM feedback GROUP BY month ORDER BY month ASC
  `).all();

  res.json({
    total,
    page,
    limit,
    items: rows.map((r) => ({ ...r, isDemo: !!r.isDemo })),
    trend: trend.map((t) => ({ ...t, average: Number((t.average || 0).toFixed(2)) }))
  });
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
