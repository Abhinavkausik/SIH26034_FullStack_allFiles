const express = require('express');
const db = require('../db');
const { listInspections } = require('../utils/inspectionStore');
const { parsePagination } = require('../utils/validate');

const router = express.Router();

// GET /api/seller/history
// Unchanged response shape (consumed by complianceApi.fetchSellerHistory), but
// now sourced from the inspection records so it carries priority and issue
// counts. Seller and consumer records are kept strictly separate.
router.get('/history', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.timestamp AS date, s.productTitle AS productName, s.brand, s.category,
           s.overallStatus AS status, s.complianceScore AS score, s.imageUrl,
           s.id AS memoId, s.checkedFields, s.inspectionId,
           i.priority, i.nonCompliantCount, i.warningCount, i.status AS inspectionStatus
    FROM scans s
    LEFT JOIN inspections i ON i.id = s.inspectionId
    WHERE s.submittedBy = 'seller'
    ORDER BY s.createdAt DESC
    LIMIT 100
  `).all();

  const history = rows.map((r) => {
    const checkedFields = JSON.parse(r.checkedFields || '[]');
    const missingFieldsCount =
      r.nonCompliantCount != null
        ? r.nonCompliantCount + (r.warningCount || 0)
        : checkedFields.filter((f) => !f.isPresent || f.isMalformed).length;

    return {
      id: r.id,
      date: r.date,
      productName: r.productName,
      brand: r.brand,
      sku: r.id,
      category: r.category,
      status: r.status,
      score: r.score,
      missingFieldsCount,
      imageUrl: r.imageUrl,
      memoId: r.memoId,
      inspectionId: r.inspectionId || null,
      priority: r.priority || null,
      inspectionStatus: r.inspectionStatus || null
    };
  });

  res.json(history);
});

// GET /api/seller/inspections - richer, filterable view of the same records
router.get('/inspections', (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const result = listInspections({
    actorType: 'SELLER',
    complianceStatus: req.query.status,
    priority: req.query.priority,
    search: req.query.search,
    from: req.query.from,
    to: req.query.to,
    limit,
    offset
  });
  res.json({ ...result, page, limit });
});

module.exports = router;
