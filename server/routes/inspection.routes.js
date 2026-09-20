const express = require('express');
const db = require('../db');
const {
  listInspections,
  getInspection,
  upsertProduct,
  resolveActor,
  recordInspection
} = require('../utils/inspectionStore');
const { parsePagination, requireEnum, optionalString } = require('../utils/validate');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

/**
 * Consumers and sellers are kept strictly apart. An actor token identifies a
 * browser, not a person, and a request can only ever read back its own
 * records unless it comes from an authenticated authority user (see
 * authority.routes.js).
 */
function actorFromRequest(req) {
  const token = req.headers['x-actor-token'];
  const type = (req.headers['x-actor-type'] || '').toUpperCase();
  if (!token) return null;
  return db
    .prepare('SELECT * FROM actors WHERE deviceToken = ? AND type = ?')
    .get(token, type === 'SELLER' ? 'SELLER' : 'CONSUMER');
}

// GET /api/inspections
// Public, but scoped: without an actor token this returns nothing personal.
router.get('/', (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const actor = actorFromRequest(req);

  if (!actor) {
    return res.json({ total: 0, page, limit, items: [] });
  }

  const result = listInspections({
    actorId: actor.id,
    actorType: actor.type,
    complianceStatus: req.query.status,
    priority: req.query.priority,
    from: req.query.from,
    to: req.query.to,
    search: req.query.search,
    sort: req.query.sort,
    order: req.query.order,
    limit,
    offset
  });

  res.json({ ...result, page, limit });
});

// GET /api/inspections/:id  - full detail including the compliance grid
router.get('/:id', (req, res) => {
  const inspection = getInspection(req.params.id);
  if (!inspection) return res.status(404).json({ error: 'Inspection not found.' });

  // Authority notes stay internal to the authority portal.
  const { authorityNotes, ...publicView } = inspection;
  res.json(publicView);
});

// POST /api/inspections
// Records an inspection that was produced outside the image-upload flow
// (for example a barcode-only check). The normal OCR path writes its own
// inspection automatically from scan.routes.js.
router.post(
  '/',
  rateLimit({ windowMs: 60000, max: 30 }),
  (req, res, next) => {
    try {
      const body = req.body || {};
      const actorType = requireEnum(
        (body.actorType || 'CONSUMER').toUpperCase(),
        ['CONSUMER', 'SELLER'],
        'actorType'
      );

      if (!body.product || !body.product.name) {
        return res.status(400).json({ error: 'product.name is required.' });
      }
      if (!Array.isArray(body.checkedFields)) {
        return res.status(400).json({ error: 'checkedFields must be an array.' });
      }

      const product = upsertProduct({
        name: body.product.name,
        brand: body.product.brand,
        barcode: body.product.barcode,
        category: body.product.category,
        manufacturer: body.product.manufacturer,
        imageUrl: body.product.imageUrl
      });

      const actor = resolveActor({
        type: actorType,
        deviceToken: req.headers['x-actor-token'] || body.actorToken,
        displayName: optionalString(body.actorName, 'actorName', { max: 120 })
      });

      const inspection = recordInspection({
        scan: null,
        result: {
          overallStatus: body.overallStatus || 'NEEDS_REVIEW',
          complianceScore: body.complianceScore,
          checkedFields: body.checkedFields,
          imageUrl: body.product.imageUrl
        },
        actor,
        product
      });

      res.status(201).json(inspection);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
