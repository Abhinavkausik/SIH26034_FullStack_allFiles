/**
 * Server-side mirror of src/data/legalMetrologyRules.ts
 * Kept in sync manually - if the frontend rulebook changes, update this file too.
 */

const LEGAL_METROLOGY_RULES_2011 = [
  {
    id: 'rule_6_1_a',
    clause: 'Rule 6(1)(a)',
    title: 'Generic or Common Name of Commodity',
    mandatoryRequirement: 'The generic or common name of the commodity contained in the package must be clearly stated.',
    statutoryAct: 'Legal Metrology Act, 2009 (Sec 36)',
    penaltySection: 'Section 36(1), Legal Metrology Act, 2009',
    penaltyDescription: 'Fine of ₹25,000 for the first offense, up to ₹50,000 for a second offense, or ₹1,00,000 / imprisonment for subsequent offenses.',
    remediationAdvice: 'Print the generic/common name of the product clearly on the principal display panel, separate from the trade brand name.'
  },
  {
    id: 'rule_6_1_b',
    clause: 'Rule 6(1)(b) & Rule 12',
    title: 'Net Quantity & Standard Units with Unit Sale Price',
    mandatoryRequirement: 'Net quantity must be declared in standard SI metric units (g, kg, ml, l, or number) without ambiguous qualifiers like "approx" or non-standard symbols.',
    statutoryAct: 'Legal Metrology Act, 2009 (Sec 36)',
    penaltySection: 'Section 36(1) read with Rule 12 & 24',
    penaltyDescription: 'Fine ranging from ₹25,000 to ₹1,00,000 depending on repeat-offense status.',
    remediationAdvice: 'Declare net quantity in standard metric units only, and include the Unit Sale Price for packages above the prescribed threshold.'
  },
  {
    id: 'rule_6_1_c',
    clause: 'Rule 6(1)(c)',
    title: 'Month and Year of Manufacture / Pre-packing / Import',
    mandatoryRequirement: 'The month and year in which the commodity is manufactured or pre-packed or imported must be explicitly declared.',
    statutoryAct: 'Legal Metrology Act, 2009 (Sec 36)',
    penaltySection: 'Section 36(1), Legal Metrology Act, 2009',
    penaltyDescription: 'Fine ranging from ₹25,000 to ₹1,00,000.',
    remediationAdvice: 'Print the month and year of manufacture/packing/import in both letters and numerals near the batch code.'
  },
  {
    id: 'rule_6_1_e',
    clause: 'Rule 6(1)(e) & Rule 6(11)',
    title: 'Maximum Retail Price (MRP) & Unit Sale Price Declaration',
    mandatoryRequirement: 'MRP must be prominently declared in Indian Rupees with the mandatory statutory phrase "(inclusive of all taxes)". Declaring taxes extra is strictly illegal.',
    statutoryAct: 'Legal Metrology Act, 2009 (Sec 36)',
    penaltySection: 'Section 36(1) & Section 36(2) [Dual pricing penalty]',
    penaltyDescription: 'Fine ranging from ₹25,000 to ₹1,00,000, with enhanced penalty for dual pricing.',
    remediationAdvice: 'Reprint MRP declaration as "MRP ₹ XXX.XX (incl. of all taxes)" and remove any "+ GST extra" style language.'
  },
  {
    id: 'rule_6_1_f',
    clause: 'Rule 6(1)(f)',
    title: 'Consumer Care Contact Details',
    mandatoryRequirement: 'Name, complete address, telephone number, and email address of the person/office that can be contacted for consumer complaints.',
    statutoryAct: 'Legal Metrology Act, 2009 (Sec 36)',
    penaltySection: 'Section 36(1), Legal Metrology Act, 2009',
    penaltyDescription: 'Fine ranging from ₹25,000 to ₹1,00,000.',
    remediationAdvice: 'Add a full consumer care block with designation, physical address, phone number, and email - a QR code or website alone is not sufficient.'
  },
  {
    id: 'rule_6_1_g',
    clause: 'Rule 6(1)(g) & Rule 6(1)(d)',
    title: 'Name & Address of Manufacturer / Packer / Importer & Country of Origin',
    mandatoryRequirement: 'Complete physical address of manufacturer/importer and Country of Origin (mandatory for imported goods).',
    statutoryAct: 'Legal Metrology Act, 2009 (Sec 36)',
    penaltySection: 'Section 36(1) & Customs / Legal Metrology Cross-Enforcement',
    penaltyDescription: 'Fine ranging from ₹25,000 to ₹1,00,000.',
    remediationAdvice: 'Print the complete manufacturer/packer address including street, city and PIN code, and add Country of Origin for any imported item.'
  },
  {
    id: 'rule_9_1',
    clause: 'Rule 9(1) & First Schedule',
    title: 'Minimum Font Height & Principal Display Panel Proportions',
    mandatoryRequirement: 'Letters and numerals on the principal display panel must meet minimum prescribed millimeter height for the given packaging area.',
    statutoryAct: 'Legal Metrology Act, 2009 (Sec 36)',
    penaltySection: 'Section 36(1) read with Rule 9',
    penaltyDescription: 'Fine ranging from ₹25,000 to ₹50,000.',
    remediationAdvice: 'Increase the font size of quantity/MRP declarations to meet the minimum height table in the First Schedule for the package\'s display area.'
  }
];

// Maps each mandatory field (from the frontend's MandatoryFieldId union) to the
// rule clause that governs it, plus metadata used when a field is missing/malformed.
const FIELD_RULE_MAP = {
  mrp: {
    fieldName: 'Maximum Retail Price (MRP)',
    ruleId: 'rule_6_1_e',
    expectedFormat: 'MRP ₹ XXX.XX (incl. of all taxes)',
    severity: 'CRITICAL'
  },
  net_quantity: {
    fieldName: 'Net Quantity',
    ruleId: 'rule_6_1_b',
    expectedFormat: 'Net Qty: XXX g / ml / l (standard SI units, no "approx")',
    severity: 'HIGH'
  },
  manufacturer_details: {
    fieldName: 'Manufacturer / Packer Address',
    ruleId: 'rule_6_1_g',
    expectedFormat: 'Full name, street, city, PIN code of manufacturer or packer',
    severity: 'HIGH'
  },
  consumer_care: {
    fieldName: 'Consumer Care Details',
    ruleId: 'rule_6_1_f',
    expectedFormat: 'Name/designation, address, phone number, email',
    severity: 'MEDIUM'
  },
  date_of_manufacture: {
    fieldName: 'Month & Year of Manufacture',
    ruleId: 'rule_6_1_c',
    expectedFormat: 'MM/YYYY in letters and numerals',
    severity: 'MEDIUM'
  },
  country_of_origin: {
    fieldName: 'Country of Origin',
    ruleId: 'rule_6_1_g',
    expectedFormat: 'Country of Origin: <country> (mandatory for imported goods)',
    severity: 'LOW'
  }
};

function getRuleById(ruleId) {
  return LEGAL_METROLOGY_RULES_2011.find(r => r.id === ruleId);
}

function getRuleByClause(clauseId) {
  return LEGAL_METROLOGY_RULES_2011.find(
    r => r.clause.toLowerCase() === String(clauseId).toLowerCase() || r.id === clauseId
  );
}

module.exports = {
  LEGAL_METROLOGY_RULES_2011,
  FIELD_RULE_MAP,
  getRuleById,
  getRuleByClause
};
