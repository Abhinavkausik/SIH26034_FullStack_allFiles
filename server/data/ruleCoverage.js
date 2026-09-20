/**
 * Rule coverage logic merged in from RULE_COVERAGE_FOR_TEAM.md (Joyshree,
 * research/pitch team). This file is the single source of truth for what the
 * engine actually checks vs. exempts vs. defers - keep it in sync with that
 * document if the coverage changes.
 */

// Every checked field carries a STATUS, not just a boolean. Ranked worst-first
// so that combining multiple signals never lets an uncertain or missing
// result get silently upgraded to a confident pass.
const FIELD_STATUS = {
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',   // the AI/OCR service failed - we don't know
  NOT_FOUND: 'NOT_FOUND',              // genuinely missing from the label
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',    // detected, but OCR/AI wasn't sure (ambiguous)
  FOUND: 'FOUND',                      // detected and confidently valid
  NOT_APPLICABLE: 'NOT_APPLICABLE'     // exempt for this product category, or not yet checkable
};

// Rank used to combine multiple signals for the same field - higher rank
// always wins ("the worst status always wins when combining sources").
// NOT_APPLICABLE is deliberately excluded from this ranking - it's decided
// up front by category exemption logic, never by combining uncertain signals.
const STATUS_RANK = {
  [FIELD_STATUS.AI_UNAVAILABLE]: 3,
  [FIELD_STATUS.NOT_FOUND]: 2,
  [FIELD_STATUS.LOW_CONFIDENCE]: 1,
  [FIELD_STATUS.FOUND]: 0
};

function combineFieldStatus(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (STATUS_RANK[a] ?? 0) >= (STATUS_RANK[b] ?? 0) ? a : b;
}

/**
 * Category-based exemptions (Part A of RULE_COVERAGE_FOR_TEAM.md) - so the
 * engine doesn't wrongly flag a label that's correctly governed by a
 * different regulator entirely.
 *
 * Matching is by loose substring against whatever category string the
 * frontend sends, so this doesn't require the frontend's category dropdown
 * to be rewritten to match these exact names.
 */
const CATEGORY_EXEMPTIONS = [
  {
    match: /food|fmcg/i,
    name: 'Food',
    skipAll: true,
    reason: 'Food labelling is governed by FSSAI, a separate regulatory scope. LMPC checks are not run at all for this category, so a valid FSSAI-compliant label is never wrongly flagged as an LMPC violation.'
  },
  {
    match: /cosmetic|personal care/i,
    name: 'Cosmetic',
    exemptFields: ['mrp'],
    reason: 'Cosmetic MRP is governed by the Drugs & Cosmetics Rules, not LMPC. Marked "not applicable", not "missing".'
  },
  {
    match: /alcohol|liquor|spirits/i,
    name: 'Alcohol',
    exemptFields: ['mrp'],
    reason: 'Alcohol MRP is governed by state excise law, not LMPC. Marked "not applicable", not "missing".'
  },
  {
    match: /lpg|cylinder/i,
    name: 'LPG Cylinder',
    exemptFields: ['date_of_manufacture'],
    conditionalExemptFields: ['mrp'], // only exempt if meta.administeredPriceMechanism === true
    reason: 'Manufacturing date is exempt for LPG cylinders. MRP is conditionally exempt when the cylinder is under the government\'s Administered Price Mechanism.'
  }
];

function resolveCategoryExemption(categoryString) {
  if (!categoryString) return null;
  return CATEGORY_EXEMPTIONS.find(c => c.match.test(categoryString)) || null;
}

/**
 * Rule coverage notes for the compliance document dashboard (Parts B and C
 * of RULE_COVERAGE_FOR_TEAM.md) - implemented-but-unverified items, and
 * deliberately-deferred items with the actual reasoning, so the document
 * shown to sellers/consumers/authority is honest about system limitations
 * rather than silently omitting them.
 */
const RULE_COVERAGE_NOTES = {
  unverified: [
    {
      title: 'Bidi vs. incense MRP distinction',
      note: 'The spec requires bidi to be MRP-exempt while incense (same product category) is not. Whether our category logic makes this fine-grained distinction is pending a code-level check.'
    },
    {
      title: 'Seeds (certified) name/quantity exemption',
      note: 'Certified seeds are exempt from the product name/quantity field under the Seeds Act. Whether this exemption is fully wired in is pending the same check.'
    }
  ],
  deferred: [
    {
      title: 'Rule 6(1)(f) - Dimensions of the commodity',
      note: 'Only applies where size is relevant (e.g. certain textiles/rolls), needing product-type-specific logic not yet built. No extraction currently pulls a dimension value at all.'
    },
    {
      title: 'Rule 6(1)(aa) - Country of Origin',
      note: 'Only legally required when the product is imported. Checking for the declaration without first knowing import status is backwards logic. Not enforced as a violation until an import-status signal (category, AI, or manual flag) is available - shown as informational only.'
    },
    {
      title: 'Rule 6(1)(l) - Unit Sale Price (multi-piece/combo packs)',
      note: 'Newly identified scope. Requires an exact format check (not just presence), which is a stricter kind of check than anything currently in the engine.'
    },
    {
      title: 'Allowed error in quantity (declared vs. actual weight)',
      note: 'Permanently out of scope for an image-only system - checking this requires the product\'s real physical weight, which no camera can measure. A hardware limitation, not an engineering gap.'
    },
    {
      title: 'Rule 7 - Layout checks (letter height, PDP placement, sticker interference)',
      note: 'Deferred for two reasons: (1) minimum letter height is a lookup table keyed to physical panel size, which needs camera calibration we don\'t have; (2) the system can\'t yet identify which uploaded photo is the front label (Principal Display Panel), which Rule 7 specifically applies to.'
    }
  ]
};

module.exports = {
  FIELD_STATUS,
  combineFieldStatus,
  CATEGORY_EXEMPTIONS,
  resolveCategoryExemption,
  RULE_COVERAGE_NOTES
};
