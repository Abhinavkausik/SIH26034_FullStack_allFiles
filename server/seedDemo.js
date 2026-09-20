require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const {
  upsertProduct,
  resolveActor,
  recordInspection,
  changeInspectionStatus,
  refreshPriority
} = require('./utils/inspectionStore');
const { complaintPriority } = require('./utils/priority');

/**
 * DEMONSTRATION DATA ONLY.
 *
 * Every row written here has isDemo = 1 and every product is fictional. These
 * are illustrative figures for a prototype walkthrough, not real enforcement
 * statistics and not real products. `npm run seed:clear` removes all of it.
 *
 * Run with:  npm run seed:demo
 */

const args = process.argv.slice(2);
const CLEAR_ONLY = args.includes('--clear');

function clearDemoData() {
  const clear = db.transaction(() => {
    db.prepare(`DELETE FROM feedback WHERE isDemo = 1`).run();
    db.prepare(`DELETE FROM complaint_events WHERE complaintId IN (SELECT id FROM complaints WHERE isDemo = 1)`).run();
    db.prepare(`DELETE FROM complaints WHERE isDemo = 1`).run();
    db.prepare(`DELETE FROM inspection_events WHERE inspectionId IN (SELECT id FROM inspections WHERE isDemo = 1)`).run();
    db.prepare(`DELETE FROM inspection_findings WHERE inspectionId IN (SELECT id FROM inspections WHERE isDemo = 1)`).run();
    db.prepare(`DELETE FROM inspections WHERE isDemo = 1`).run();
    db.prepare(`DELETE FROM actors WHERE isDemo = 1`).run();
    db.prepare(`DELETE FROM products WHERE isDemo = 1`).run();
  });
  clear();
  console.log('Demonstration data removed.');
}

if (CLEAR_ONLY) {
  clearDemoData();
  process.exit(0);
}

clearDemoData();

// ---------------------------------------------------------------------------
// Field templates, reusing the real rule references from the engine
// ---------------------------------------------------------------------------

const FIELD_TEMPLATES = {
  mrp: { fieldId: 'mrp', fieldName: 'Maximum Retail Price (MRP)', ruleReference: 'Rule 6(1)(e) & Rule 6(11)', severity: 'CRITICAL' },
  net_quantity: { fieldId: 'net_quantity', fieldName: 'Net Quantity', ruleReference: 'Rule 6(1)(b) & Rule 12', severity: 'HIGH' },
  manufacturer_details: { fieldId: 'manufacturer_details', fieldName: 'Manufacturer / Packer Address', ruleReference: 'Rule 6(1)(g) & Rule 6(1)(d)', severity: 'HIGH' },
  consumer_care: { fieldId: 'consumer_care', fieldName: 'Consumer Care Details', ruleReference: 'Rule 6(1)(f)', severity: 'MEDIUM' },
  date_of_manufacture: { fieldId: 'date_of_manufacture', fieldName: 'Month & Year of Manufacture', ruleReference: 'Rule 6(1)(c)', severity: 'MEDIUM' },
  country_of_origin: { fieldId: 'country_of_origin', fieldName: 'Country of Origin', ruleReference: 'Rule 6(1)(g) & Rule 6(1)(d)', severity: 'LOW' },
  unit_sale_price: { fieldId: 'unit_sale_price', fieldName: 'Unit Sale Price', ruleReference: 'Rule 6(11)', severity: 'MEDIUM' }
};

const STATUS_BY_OUTCOME = {
  pass: { status: 'FOUND', text: 'Declaration present and correctly formatted.' },
  fail: { status: 'NOT_FOUND', text: 'Mandatory declaration could not be located on the principal display panel.' },
  warn: { status: 'LOW_CONFIDENCE', text: 'Declaration detected but ambiguous or non-standard in format.' },
  na: { status: 'NOT_APPLICABLE', text: 'Not applicable for this product category.' }
};

function buildCheckedFields(outcomes) {
  return Object.entries(outcomes).map(([fieldId, outcome]) => {
    const template = FIELD_TEMPLATES[fieldId];
    const state = STATUS_BY_OUTCOME[outcome];
    return {
      ...template,
      status: state.status,
      isPresent: state.status === 'FOUND',
      isMalformed: state.status === 'LOW_CONFIDENCE',
      explanation: state.text,
      expectedFormat: ''
    };
  });
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

// ---------------------------------------------------------------------------
// Fictional products
// ---------------------------------------------------------------------------

const PRODUCTS = [
  { key: 'A', name: 'Packaged Food A (Demo)', brand: 'Demo Foods', category: 'Commodities & Grains', barcode: '8900000000017', manufacturer: 'Demo Foods Pvt Ltd, Guwahati' },
  { key: 'B', name: 'Packaged Beverage B (Demo)', brand: 'Demo Beverages', category: 'Food & FMCG', barcode: '8900000000024', manufacturer: 'Demo Beverages Ltd, Nagaon' },
  { key: 'C', name: 'Grocery Product C (Demo)', brand: 'Demo Grocers', category: 'Commodities & Grains', barcode: '8900000000031', manufacturer: 'Demo Grocers LLP, Jorhat' },
  { key: 'D', name: 'Consumer Product D (Demo)', brand: 'Demo Care', category: 'Cosmetics & Personal Care', barcode: '8900000000048', manufacturer: 'Demo Care Industries, Dibrugarh' },
  { key: 'E', name: 'Household Item E (Demo)', brand: 'Demo Home', category: 'General', barcode: '8900000000055', manufacturer: 'Demo Home Products, Tinsukia' },
  { key: 'F', name: 'Packaged Snack F (Demo)', brand: 'Demo Foods', category: 'Commodities & Grains', barcode: '8900000000062', manufacturer: 'Demo Foods Pvt Ltd, Guwahati' },
  { key: 'G', name: 'Electronics Accessory G (Demo)', brand: 'Demo Electronics', category: 'Electronics', barcode: '8900000000079', manufacturer: 'Demo Electronics, Sivasagar' }
];

const SELLERS = [
  { name: 'Demo Retail Mart, Jorhat', token: 'demo-seller-1' },
  { name: 'Demo Wholesale Depot, Titabor', token: 'demo-seller-2' }
];

const CONSUMERS = [
  { name: 'Demo Consumer 1', token: 'demo-consumer-1' },
  { name: 'Demo Consumer 2', token: 'demo-consumer-2' },
  { name: 'Demo Consumer 3', token: 'demo-consumer-3' }
];

// inspections: [productKey, actorKind, actorIndex, overallStatus, outcomes, ageDays, finalStatus]
const INSPECTIONS = [
  ['A', 'SELLER', 0, 'NON_COMPLIANT', { mrp: 'fail', net_quantity: 'pass', manufacturer_details: 'pass', consumer_care: 'fail', date_of_manufacture: 'fail', country_of_origin: 'pass', unit_sale_price: 'fail' }, 120, 'RESOLVED'],
  ['A', 'CONSUMER', 0, 'NON_COMPLIANT', { mrp: 'fail', net_quantity: 'warn', manufacturer_details: 'pass', consumer_care: 'fail', date_of_manufacture: 'pass', country_of_origin: 'pass', unit_sale_price: 'fail' }, 26, 'UNDER_REVIEW'],
  ['B', 'CONSUMER', 1, 'COMPLIANT', { mrp: 'pass', net_quantity: 'pass', manufacturer_details: 'pass', consumer_care: 'pass', date_of_manufacture: 'pass', country_of_origin: 'pass', unit_sale_price: 'pass' }, 95, null],
  ['B', 'SELLER', 1, 'COMPLIANT', { mrp: 'pass', net_quantity: 'pass', manufacturer_details: 'pass', consumer_care: 'pass', date_of_manufacture: 'pass', country_of_origin: 'pass', unit_sale_price: 'pass' }, 18, null],
  ['C', 'CONSUMER', 2, 'NON_COMPLIANT', { mrp: 'pass', net_quantity: 'fail', manufacturer_details: 'fail', consumer_care: 'pass', date_of_manufacture: 'fail', country_of_origin: 'fail', unit_sale_price: 'pass' }, 62, 'ACTION_REQUIRED'],
  ['C', 'SELLER', 0, 'NEEDS_REVIEW', { mrp: 'warn', net_quantity: 'pass', manufacturer_details: 'pass', consumer_care: 'warn', date_of_manufacture: 'pass', country_of_origin: 'pass', unit_sale_price: 'na' }, 9, null],
  ['D', 'CONSUMER', 0, 'NON_COMPLIANT', { mrp: 'na', net_quantity: 'pass', manufacturer_details: 'pass', consumer_care: 'fail', date_of_manufacture: 'pass', country_of_origin: 'pass', unit_sale_price: 'na' }, 47, 'RESOLVED'],
  ['D', 'SELLER', 1, 'COMPLIANT', { mrp: 'na', net_quantity: 'pass', manufacturer_details: 'pass', consumer_care: 'pass', date_of_manufacture: 'pass', country_of_origin: 'pass', unit_sale_price: 'na' }, 12, null],
  ['E', 'CONSUMER', 1, 'NON_COMPLIANT', { mrp: 'pass', net_quantity: 'pass', manufacturer_details: 'pass', consumer_care: 'pass', date_of_manufacture: 'pass', country_of_origin: 'fail', unit_sale_price: 'pass' }, 33, 'UNDER_REVIEW'],
  ['F', 'SELLER', 0, 'NEEDS_REVIEW', { mrp: 'warn', net_quantity: 'pass', manufacturer_details: 'pass', consumer_care: 'pass', date_of_manufacture: 'warn', country_of_origin: 'pass', unit_sale_price: 'pass' }, 74, 'RESOLVED'],
  ['F', 'CONSUMER', 2, 'NON_COMPLIANT', { mrp: 'fail', net_quantity: 'fail', manufacturer_details: 'fail', consumer_care: 'fail', date_of_manufacture: 'pass', country_of_origin: 'pass', unit_sale_price: 'fail' }, 5, null],
  ['G', 'SELLER', 1, 'COMPLIANT', { mrp: 'pass', net_quantity: 'pass', manufacturer_details: 'pass', consumer_care: 'pass', date_of_manufacture: 'pass', country_of_origin: 'pass', unit_sale_price: 'na' }, 55, null],
  ['G', 'CONSUMER', 0, 'NEEDS_REVIEW', { mrp: 'pass', net_quantity: 'warn', manufacturer_details: 'pass', consumer_care: 'pass', date_of_manufacture: 'pass', country_of_origin: 'warn', unit_sale_price: 'na' }, 21, null],
  ['E', 'SELLER', 0, 'COMPLIANT', { mrp: 'pass', net_quantity: 'pass', manufacturer_details: 'pass', consumer_care: 'pass', date_of_manufacture: 'pass', country_of_origin: 'pass', unit_sale_price: 'pass' }, 3, null]
];

const COMPLAINTS = [
  { inspectionIndex: 1, category: 'INCORRECT_MRP', description: 'Demonstration complaint: the price charged at the counter was higher than the printed maximum retail price on the pack.', status: 'UNDER_REVIEW', ageDays: 24 },
  { inspectionIndex: 4, category: 'MISSING_INFORMATION', description: 'Demonstration complaint: the pack does not show the manufacturer address or the month of manufacture anywhere.', status: 'ACTION_TAKEN', ageDays: 58 },
  { inspectionIndex: 10, category: 'EXPIRED_PRODUCT', description: 'Demonstration complaint: pack appears to be past its usable date and the date panel is illegible.', status: 'SUBMITTED', ageDays: 4 },
  { inspectionIndex: 8, category: 'LABELLING_ISSUE', description: 'Demonstration complaint: country of origin is not declared on an imported household item.', status: 'UNDER_REVIEW', ageDays: 30 },
  { inspectionIndex: 6, category: 'MISLEADING_INFORMATION', description: 'Demonstration complaint: pack front claims a quantity that does not match the declared net quantity.', status: 'RESOLVED', ageDays: 44 },
  { inspectionIndex: 0, category: 'INCORRECT_QUANTITY', description: 'Demonstration complaint: measured contents were noticeably below the declared net quantity.', status: 'RESOLVED', ageDays: 110 }
];

const FEEDBACK = [
  { productKey: 'A', rating: 2, review: 'Demonstration review: label information is incomplete and hard to read.', q: 2, p: 3, l: 1, o: 2, age: 25, name: 'Demo Consumer 1' },
  { productKey: 'A', rating: 2.5, review: 'Demonstration review: product is fine but the printed details are unclear.', q: 3, p: 3, l: 2, o: 2, age: 14, name: 'Demo Consumer 3' },
  { productKey: 'B', rating: 5, review: 'Demonstration review: everything declared clearly on the pack.', q: 5, p: 5, l: 5, o: 5, age: 40, name: 'Demo Consumer 2' },
  { productKey: 'B', rating: 4.5, review: 'Demonstration review: well packaged and clearly labelled.', q: 5, p: 4, l: 5, o: 4, age: 11, name: 'Demo Consumer 1' },
  { productKey: 'C', rating: 1.5, review: 'Demonstration review: several mandatory details missing from the pack.', q: 2, p: 2, l: 1, o: 1, age: 55, name: 'Demo Consumer 3' },
  { productKey: 'C', rating: 3, review: 'Demonstration review: acceptable product, labelling could be better.', q: 3, p: 3, l: 2, o: 3, age: 8, name: 'Demo Consumer 2' },
  { productKey: 'D', rating: 4, review: 'Demonstration review: good packaging, consumer care details were missing though.', q: 4, p: 5, l: 3, o: 4, age: 45, name: 'Demo Consumer 1' },
  { productKey: 'E', rating: 3.5, review: 'Demonstration review: origin of the product is not stated anywhere.', q: 4, p: 4, l: 2, o: 3, age: 31, name: 'Demo Consumer 2' },
  { productKey: 'F', rating: 1, review: 'Demonstration review: almost no statutory information printed on this pack.', q: 1, p: 2, l: 1, o: 1, age: 4, name: 'Demo Consumer 3' },
  { productKey: 'G', rating: 4.5, review: 'Demonstration review: clear declarations and neat packaging.', q: 5, p: 4, l: 5, o: 4, age: 20, name: 'Demo Consumer 1' },
  { productKey: 'G', rating: 4, review: 'Demonstration review: quantity marking was slightly ambiguous.', q: 4, p: 4, l: 3, o: 4, age: 6, name: 'Demo Consumer 2' },
  { productKey: 'B', rating: 5, review: 'Demonstration review: no issues found at all.', q: 5, p: 5, l: 5, o: 5, age: 2, name: 'Demo Consumer 3' }
];

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

console.log('Seeding DEMONSTRATION data (all rows flagged isDemo = 1)...');

const productRows = {};
PRODUCTS.forEach((p) => {
  productRows[p.key] = upsertProduct({ ...p, isDemo: true });
});

const sellerActors = SELLERS.map((s) =>
  resolveActor({ type: 'SELLER', deviceToken: s.token, displayName: s.name, isDemo: true })
);
const consumerActors = CONSUMERS.map((c) =>
  resolveActor({ type: 'CONSUMER', deviceToken: c.token, displayName: c.name, isDemo: true })
);

// Mark seeded actors as demo rows so seed:clear can find them.
[...sellerActors, ...consumerActors].forEach((a) => {
  db.prepare('UPDATE actors SET isDemo = 1 WHERE id = ?').run(a.id);
});

const createdInspections = INSPECTIONS.map(
  ([productKey, actorKind, actorIndex, overallStatus, outcomes, ageDays, finalStatus]) => {
    const actor = actorKind === 'SELLER' ? sellerActors[actorIndex] : consumerActors[actorIndex];

    const inspection = recordInspection({
      scan: null,
      result: {
        overallStatus,
        complianceScore: null,
        checkedFields: buildCheckedFields(outcomes)
      },
      actor,
      product: productRows[productKey],
      isDemo: true,
      createdAt: daysAgo(ageDays)
    });

    if (finalStatus) {
      changeInspectionStatus({
        id: inspection.id,
        status: finalStatus,
        notes:
          finalStatus === 'RESOLVED'
            ? 'Demonstration record: corrective labelling confirmed on re-inspection.'
            : 'Demonstration record: case opened for inspector review.',
        actedBy: 'Demo Inspector'
      });
      db.prepare(`UPDATE inspections SET updatedAt = ? WHERE id = ?`)
        .run(daysAgo(Math.max(0, ageDays - 5)), inspection.id);
    }

    return inspection;
  }
);

COMPLAINTS.forEach((c) => {
  const inspection = createdInspections[c.inspectionIndex];
  if (!inspection) return;

  const id = `CMP-DEMO-${uuidv4().slice(0, 6).toUpperCase()}`;
  const { priority, reason } = complaintPriority(c.category);
  const createdAt = daysAgo(c.ageDays);

  db.prepare(`
    INSERT INTO complaints
      (id, inspectionId, productId, actorId, category, description, status, priority, isDemo, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    inspection.id,
    inspection.productId,
    inspection.actorId,
    c.category,
    c.description,
    c.status,
    priority,
    createdAt,
    createdAt
  );

  db.prepare(`
    INSERT INTO complaint_events (id, complaintId, fromStatus, toStatus, notes, actedBy, timestamp)
    VALUES (?, ?, NULL, 'SUBMITTED', ?, 'consumer', ?)
  `).run(uuidv4(), id, reason, createdAt);

  if (c.status !== 'SUBMITTED') {
    db.prepare(`
      INSERT INTO complaint_events (id, complaintId, fromStatus, toStatus, notes, actedBy, timestamp)
      VALUES (?, ?, 'SUBMITTED', ?, ?, 'Demo Inspector', ?)
    `).run(
      uuidv4(),
      id,
      c.status,
      'Demonstration record: status advanced by the reviewing inspector.',
      daysAgo(Math.max(0, c.ageDays - 3))
    );
  }

  refreshPriority(inspection.id);
});

FEEDBACK.forEach((f) => {
  const product = productRows[f.productKey];
  const inspection = createdInspections.find((i) => i.productId === product.id);
  const actor = consumerActors[Math.floor(Math.random() * consumerActors.length)];

  db.prepare(`
    INSERT INTO feedback
      (id, productId, inspectionId, actorId, rating, qualityRating, packagingRating,
       labelClarityRating, overallRating, reviewText, displayName, isDemo, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    `FBK-DEMO-${uuidv4().slice(0, 6).toUpperCase()}`,
    product.id,
    inspection ? inspection.id : null,
    actor.id,
    f.rating,
    f.q,
    f.p,
    f.l,
    f.o,
    f.review,
    f.name,
    daysAgo(f.age)
  );
});

const counts = {
  products: db.prepare('SELECT COUNT(*) AS c FROM products WHERE isDemo = 1').get().c,
  inspections: db.prepare('SELECT COUNT(*) AS c FROM inspections WHERE isDemo = 1').get().c,
  findings: db.prepare('SELECT COUNT(*) AS c FROM inspection_findings').get().c,
  complaints: db.prepare('SELECT COUNT(*) AS c FROM complaints WHERE isDemo = 1').get().c,
  feedback: db.prepare('SELECT COUNT(*) AS c FROM feedback WHERE isDemo = 1').get().c
};

console.log('Demonstration data seeded:', counts);
console.log('All products are fictional. These are not real enforcement statistics.');
console.log('Remove it at any time with: npm run seed:clear');
