const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { checkCompliance, demoExtraction } = require('../utils/ruleEngine');
const { generateComplianceReport } = require('../utils/pdfReport');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads are allowed.'));
  }
});

/**
 * POST /api/scan-label
 * multipart/form-data:
 *   - image: the label photo (required)
 *   - productTitle, brand, category, packType, batchNumber, barcode: optional text fields
 *   - submittedBy: 'seller' | 'consumer' (default 'consumer')
 *   - extractedFields: optional JSON string - see utils/ruleEngine.js for the contract.
 *       Once the OCR/rule-engine teammate's service is ready, either have it call
 *       this field directly, or run OCR upstream and forward the JSON here.
 */
router.post('/scan-label', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'An image file is required (field name: "image").' });
    }

    const body = req.body || {};
    let extractedFields;
    let meta = {};

    if (body.extractedFields) {
      try {
        const parsed = JSON.parse(body.extractedFields);
        extractedFields = parsed.extractedFields || parsed;
        meta = {
          principalDisplayAreaCm2: parsed.principalDisplayAreaCm2 ? Number(parsed.principalDisplayAreaCm2) : undefined,
          detectedFontHeightMm: parsed.detectedFontHeightMm ? Number(parsed.detectedFontHeightMm) : undefined,
          isImported: parsed.isImported === true,
          administeredPriceMechanism: parsed.administeredPriceMechanism === true
        };
      } catch (e) {
        return res.status(400).json({ error: 'extractedFields must be valid JSON.' });
      }
    } else {
      // No OCR output supplied yet - fall back to a deterministic demo extraction
      // so the rest of the pipeline (DB, PDF, authority portal) is fully testable.
      extractedFields = demoExtraction(req.file.originalname);
    }

    const result = checkCompliance(extractedFields, meta, body.category);
    const id = `LM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const timestamp = new Date().toISOString();
    const imageUrl = `/uploads/${req.file.filename}`;
    const submittedBy = ['seller', 'consumer', 'authority'].includes(body.submittedBy) ? body.submittedBy : 'consumer';

    const scanRow = {
      id,
      timestamp,
      productTitle: body.productTitle || req.file.originalname.replace(/\.[^/.]+$/, ''),
      brand: body.brand || null,
      category: body.category || null,
      packType: body.packType || null,
      batchNumber: body.batchNumber || null,
      barcode: body.barcode || null,
      imageUrl,
      overallStatus: result.overallStatus,
      complianceScore: result.complianceScore,
      checkedFields: JSON.stringify(result.checkedFields),
      violations: JSON.stringify(result.violations),
      principalDisplayAreaCm2: meta.principalDisplayAreaCm2 ?? null,
      minimumFontHeightMm: null,
      detectedFontHeightMm: meta.detectedFontHeightMm ?? null,
      isFontCompliant: typeof result.isFontCompliant === 'boolean' ? (result.isFontCompliant ? 1 : 0) : null,
      inspectorNotes: null,
      inspectionMemoNumber: null,
      estimatedStatutoryFine: result.estimatedStatutoryFine,
      submittedBy,
      reportPath: null,
      actionStatus: 'PENDING'
    };

    db.prepare(`
      INSERT INTO scans (
        id, timestamp, productTitle, brand, category, packType, batchNumber, barcode, imageUrl,
        overallStatus, complianceScore, checkedFields, violations, principalDisplayAreaCm2,
        minimumFontHeightMm, detectedFontHeightMm, isFontCompliant, inspectorNotes,
        inspectionMemoNumber, estimatedStatutoryFine, submittedBy, reportPath, actionStatus
      ) VALUES (
        @id, @timestamp, @productTitle, @brand, @category, @packType, @batchNumber, @barcode, @imageUrl,
        @overallStatus, @complianceScore, @checkedFields, @violations, @principalDisplayAreaCm2,
        @minimumFontHeightMm, @detectedFontHeightMm, @isFontCompliant, @inspectorNotes,
        @inspectionMemoNumber, @estimatedStatutoryFine, @submittedBy, @reportPath, @actionStatus
      )
    `).run(scanRow);

    // Auto-generate a failure/improvement PDF report and flag it for the
    // authority portal whenever a product fails the check.
    if (result.overallStatus === 'NON_COMPLIANT' || result.overallStatus === 'FLAGGED_REVIEW') {
      const reportPath = generateComplianceReport(scanRow);
      db.prepare('UPDATE scans SET reportPath = ? WHERE id = ?').run(reportPath, id);
      scanRow.reportPath = reportPath;
    }

    res.status(201).json(hydrateScan(scanRow));
  } catch (err) {
    console.error('Error in POST /scan-label:', err);
    res.status(500).json({ error: 'Failed to process the scan. Please try again.' });
  }
});

// GET /api/scan-label/:id - fetch a single scan result by id
router.get('/scan-label/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM scans WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Scan not found.' });
  res.json(hydrateScan(row));
});

function hydrateScan(row) {
  return {
    ...row,
    checkedFields: typeof row.checkedFields === 'string' ? JSON.parse(row.checkedFields) : row.checkedFields,
    violations: typeof row.violations === 'string' ? JSON.parse(row.violations) : row.violations,
    isFontCompliant: row.isFontCompliant === null ? undefined : !!row.isFontCompliant
  };
}

module.exports = { router, hydrateScan };
