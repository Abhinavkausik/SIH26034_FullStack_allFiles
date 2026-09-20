/**
 * ============================================================================
 * PLACEHOLDER / MOCK DATA - NOT the real scanner.
 * ============================================================================
 *
 * This file exists so the Public Consumer Dashboard has something to show
 * before the real OCR/VLM scanning pipeline (owned separately, integrated via
 * GitHub) is wired in. It is intentionally isolated from everything under
 * utils/pythonBridge.js, utils/pythonReportAdapter.js, utils/ruleEngine.js and
 * routes/scan.routes.js - none of that real scanning code is touched or
 * imported here, and this file touches none of it either.
 *
 * HOW TO REPLACE THIS WITH THE REAL SCANNER:
 *   1. Once the real scanning code is integrated, point the frontend's
 *      Public Consumer Dashboard (src/components/public/PublicConsumerDashboard.tsx)
 *      at the real endpoint (e.g. POST /api/scan-label, the same one the
 *      existing Consumer Scan / Seller Self-Check tabs already use) instead of
 *      POST /api/public-check/:productKey.
 *   2. Delete this file and server/routes/publicCheck.routes.js, and remove
 *      the one mount line for them in server/index.js.
 *   That's the whole swap - nothing else in the app depends on this file.
 *
 * Each entry's `checkedFields` follows the exact same shape the real pipeline
 * produces (see utils/pythonReportAdapter.js / utils/ruleEngine.js), so
 * everything downstream (inspection storage, the compliance grid, priority
 * scoring, complaints, feedback) already works identically for both.
 */

const FIELD = (fieldId, fieldName, ruleReference, severity) => ({ fieldId, fieldName, ruleReference, severity });

const MRP = FIELD('mrp', 'Maximum Retail Price (MRP)', 'Rule 6(1)(e) & Rule 6(11)', 'CRITICAL');
const NET_QTY = FIELD('net_quantity', 'Net Quantity', 'Rule 6(1)(b) & Rule 12', 'HIGH');
const MFR = FIELD('manufacturer_details', 'Manufacturer / Packer Address', 'Rule 6(1)(g) & Rule 6(1)(d)', 'HIGH');
const CARE = FIELD('consumer_care', 'Consumer Care Details', 'Rule 6(1)(f)', 'MEDIUM');
const DOM = FIELD('date_of_manufacture', 'Month & Year of Manufacture', 'Rule 6(1)(c)', 'MEDIUM');
const ORIGIN = FIELD('country_of_origin', 'Country of Origin', 'Rule 6(1)(g) & Rule 6(1)(d)', 'LOW');
const USP = FIELD('unit_sale_price', 'Unit Sale Price', 'Rule 6(11)', 'MEDIUM');

function field(base, status, explanation) {
  return {
    ...base,
    status,
    isPresent: status === 'FOUND',
    isMalformed: status === 'LOW_CONFIDENCE',
    explanation,
    expectedFormat: ''
  };
}

/**
 * MOCK_PRODUCT_CATALOG - placeholder products for testing the consumer
 * dashboard end to end (check -> compliance result -> complaint -> feedback)
 * without a working scanner. Swap or delete freely.
 */
const MOCK_PRODUCT_CATALOG = [
  {
    key: 'sunrise-basmati-5kg',
    name: 'Sunrise Basmati Rice 5kg',
    brand: 'Sunrise Foods',
    category: 'Commodities & Grains',
    manufacturer: 'Sunrise Foods Pvt Ltd, Guwahati',
    barcode: '8901000000011',
    summary: 'Fully compliant placeholder - every mandatory declaration present.',
    overallStatus: 'COMPLIANT',
    checkedFields: [
      field(MRP, 'FOUND', 'MRP clearly printed and inclusive of all taxes.'),
      field(NET_QTY, 'FOUND', 'Net quantity declared in standard units.'),
      field(MFR, 'FOUND', 'Manufacturer name and complete address present.'),
      field(CARE, 'FOUND', 'Consumer care phone number and email present.'),
      field(DOM, 'FOUND', 'Month and year of manufacture printed clearly.'),
      field(ORIGIN, 'NOT_APPLICABLE', 'Domestically manufactured, not an imported product.'),
      field(USP, 'FOUND', 'Unit sale price per kg declared alongside MRP.')
    ]
  },
  {
    key: 'daily-glow-facewash-100ml',
    name: 'Daily Glow Face Wash 100ml',
    brand: 'Daily Glow',
    category: 'Cosmetics & Personal Care',
    manufacturer: 'Daily Glow Cosmetics, Dibrugarh',
    barcode: '8901000000028',
    summary: 'Placeholder with a couple of missing declarations, for testing complaints.',
    overallStatus: 'NON_COMPLIANT',
    checkedFields: [
      field(MRP, 'FOUND', 'MRP printed on the front panel.'),
      field(NET_QTY, 'FOUND', 'Net quantity (100ml) declared.'),
      field(MFR, 'NOT_FOUND', 'No manufacturer address located on any panel.'),
      field(CARE, 'NOT_FOUND', 'No consumer care contact details found.'),
      field(DOM, 'LOW_CONFIDENCE', 'A date-like mark was found but is not clearly the month/year of manufacture.'),
      field(ORIGIN, 'NOT_APPLICABLE', 'Domestically manufactured, not an imported product.'),
      field(USP, 'FOUND', 'Unit sale price present.')
    ]
  },
  {
    key: 'chilltech-cable-2m',
    name: 'ChillTech USB-C Cable 2m',
    brand: 'ChillTech',
    category: 'Electronics',
    manufacturer: 'ChillTech Electronics, Imported',
    barcode: '8901000000035',
    summary: 'Placeholder flagged for manual review - mixed signal quality.',
    overallStatus: 'NEEDS_REVIEW',
    checkedFields: [
      field(MRP, 'FOUND', 'MRP printed on the blister packaging.'),
      field(NET_QTY, 'NOT_APPLICABLE', 'Not a commodity sold by weight or volume.'),
      field(MFR, 'LOW_CONFIDENCE', 'An address-like block was found but text quality is too low to confirm.'),
      field(CARE, 'FOUND', 'Consumer care email present.'),
      field(DOM, 'NOT_FOUND', 'No month/year of manufacture located.'),
      field(ORIGIN, 'FOUND', 'Country of origin declared on the rear panel.'),
      field(USP, 'NOT_APPLICABLE', 'Not sold by weight, measure or number in the relevant sense.')
    ]
  }
];

function getMockProduct(key) {
  return MOCK_PRODUCT_CATALOG.find((p) => p.key === key) || null;
}

function listMockCatalog() {
  return MOCK_PRODUCT_CATALOG.map(({ key, name, brand, category, summary, overallStatus }) => ({
    key,
    name,
    brand,
    category,
    summary,
    overallStatus
  }));
}

module.exports = { MOCK_PRODUCT_CATALOG, getMockProduct, listMockCatalog };
