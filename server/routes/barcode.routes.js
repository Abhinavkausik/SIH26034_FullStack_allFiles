const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const db = require('../db');

const router = express.Router();

// Very loose EAN-8 / UPC-A / EAN-13 sanity check - reject obvious garbage input
// without being strict about check-digit validation.
function looksLikeBarcode(code) {
  return /^[0-9]{6,14}$/.test(code);
}

function normalizeCategory(offCategories) {
  if (!offCategories) return null;
  const first = String(offCategories).split(',')[0].trim();
  return first || null;
}

/**
 * Looks up a barcode's product identity: local SQLite cache first, then the
 * free/public Open Food Facts database on a cache miss. Shared by both the
 * direct GET /:code lookup and the image-decode endpoint below, so a barcode
 * found via camera, manual entry, or the teammate's OpenCV decoder all get
 * identical product-lookup behaviour.
 */
async function lookupBarcodeCode(code) {
  const cached = db.prepare('SELECT * FROM barcode_lookups WHERE code = ?').get(code);
  if (cached) {
    return {
      code,
      found: !!cached.found,
      productTitle: cached.productTitle,
      brand: cached.brand,
      category: cached.category,
      imageUrl: cached.imageUrl,
      source: cached.source,
      cached: true
    };
  }

  try {
    const offRes = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,categories,image_url`,
      { signal: AbortSignal.timeout(6000) }
    );

    if (offRes.ok) {
      const data = await offRes.json();

      if (data.status === 1 && data.product) {
        const result = {
          found: true,
          productTitle: data.product.product_name || null,
          brand: data.product.brands ? data.product.brands.split(',')[0].trim() : null,
          category: normalizeCategory(data.product.categories),
          imageUrl: data.product.image_url || null,
          source: 'openfoodfacts'
        };

        db.prepare(`
          INSERT INTO barcode_lookups (code, found, productTitle, brand, category, imageUrl, source)
          VALUES (?, 1, ?, ?, ?, ?, ?)
        `).run(code, result.productTitle, result.brand, result.category, result.imageUrl, result.source);

        return { code, ...result, cached: false };
      }
    }
  } catch (err) {
    console.warn(`Barcode lookup upstream failed for ${code}:`, err.message);
  }

  db.prepare(`
    INSERT OR IGNORE INTO barcode_lookups (code, found, source)
    VALUES (?, 0, 'not_found')
  `).run(code);

  return {
    code,
    found: false,
    productTitle: null,
    brand: null,
    category: null,
    imageUrl: null,
    source: null,
    cached: false
  };
}

/**
 * GET /api/barcode/:code
 * Direct lookup for a barcode you already have the number for (typed in,
 * or decoded client-side by the browser's live camera scanner).
 */
router.get('/:code', async (req, res) => {
  const { code } = req.params;
  if (!looksLikeBarcode(code)) {
    return res.status(400).json({ error: 'That does not look like a valid barcode (expected 6-14 digits).' });
  }
  res.json(await lookupBarcodeCode(code));
});

// ---------------------------------------------------------------------------
// Image-based decoding - teammate's OpenCV detector (barcode_scanner.py /
// scanner.py), merged in as server/scripts/decode_barcode.py
// ---------------------------------------------------------------------------

const TMP_DIR = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads are allowed.'));
  }
});

const PYTHON_SCRIPT = path.join(__dirname, '..', 'scripts', 'decode_barcode.py');
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

/**
 * POST /api/barcode/decode-image
 * multipart/form-data: { image: <file> }
 *
 * For a photo of a barcode/QR code (rather than a live camera feed) - runs
 * the teammate's OpenCV-based detector against it and, if something is
 * decoded, immediately runs the same product lookup as the direct endpoint.
 *
 * Requires Python 3 + opencv-python on the server (see
 * server/scripts/requirements.txt). If that isn't installed, this endpoint
 * returns a clear error - it does not affect the live camera scanner or the
 * rest of the app, which don't depend on Python at all.
 */
router.post('/decode-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'An image file is required (field name: "image").' });
  }

  const imagePath = req.file.path;

  execFile(PYTHON_BIN, [PYTHON_SCRIPT, imagePath], { timeout: 10000 }, async (err, stdout) => {
    fs.unlink(imagePath, () => {}); // clean up the temp upload either way

    if (err) {
      return res.status(500).json({
        error: 'Could not run the barcode decoder. Make sure Python 3 and opencv-python are installed on the server (see server/scripts/requirements.txt).'
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      return res.status(500).json({ error: 'Unexpected output from the barcode decoder script.' });
    }

    if (!parsed.success) {
      return res.json({ success: false, error: parsed.error || 'No barcode or QR code detected in this image.' });
    }

    // A decoded QR code often isn't a plain numeric barcode (could be a URL
    // or free text), so only run the product lookup when it looks numeric.
    let lookup = null;
    if (looksLikeBarcode(parsed.data)) {
      lookup = await lookupBarcodeCode(parsed.data);
    }

    res.json({
      success: true,
      type: parsed.type,       // 'barcode' | 'qrcode'
      data: parsed.data,
      lookup
    });
  });
});

module.exports = router;
