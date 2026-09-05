export type MandatoryFieldId = 
  | 'mrp'
  | 'net_quantity'
  | 'manufacturer_details'
  | 'consumer_care'
  | 'date_of_manufacture'
  | 'country_of_origin';

export type ComplianceStatus = 'COMPLIANT' | 'NON_COMPLIANT' | 'FLAGGED_REVIEW';

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface BoundingBox {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  label: string;
  isCompliant: boolean;
}

export interface RuleClauseViolation {
  clauseId: string; // e.g., "Rule 6(1)(e)"
  clauseTitle: string; // e.g., "Maximum Retail Price Declaration"
  ruleBook: string; // "Legal Metrology (Packaged Commodities) Rules, 2011"
  description: string;
  violationReason: string;
  detectedSnippet?: string;
  mandatoryRequirement: string;
  statutoryAct: string; // e.g., "Legal Metrology Act, 2009 (Sec 36)"
  penaltyDescription: string;
  penaltySection: string;
  severity: SeverityLevel;
  remediationAdvice: string;
}

export type FieldStatus = 'FOUND' | 'NOT_FOUND' | 'LOW_CONFIDENCE' | 'AI_UNAVAILABLE' | 'NOT_APPLICABLE';

export interface FieldComplianceResult {
  fieldId: MandatoryFieldId;
  fieldName: string;
  ruleReference: string;
  status?: FieldStatus;
  isPresent: boolean;
  isMalformed: boolean;
  detectedText?: string;
  expectedFormat: string;
  explanation: string;
  severity: SeverityLevel;
  boundingBox?: BoundingBox;
}

export interface ScanResult {
  id: string;
  timestamp: string;
  productTitle: string;
  brand: string;
  category: 'Food & FMCG' | 'Cosmetics & Personal Care' | 'Electronics' | 'Pharmaceuticals & OTC' | 'Apparel & Textiles' | 'Commodities & Grains';
  packType: 'Pouch' | 'Bottle/Jar' | 'Carton Box' | 'Tin/Can' | 'E-commerce Pack';
  batchNumber?: string;
  barcode?: string;
  imageUrl: string;
  overallStatus: ComplianceStatus;
  complianceScore: number; // 0 - 100
  checkedFields: FieldComplianceResult[];
  violations: RuleClauseViolation[];
  principalDisplayAreaCm2?: number;
  minimumFontHeightMm?: number;
  detectedFontHeightMm?: number;
  isFontCompliant?: boolean;
  inspectorNotes?: string;
  inspectionMemoNumber?: string;
  estimatedStatutoryFine: string;
  categoryExemptionApplied?: string;
}

export interface RegulatorTrendData {
  month: string;
  totalScans: number;
  compliantCount: number;
  nonCompliantCount: number;
  criticalViolations: number;
  fmcgViolations: number;
  electronicsViolations: number;
  cosmeticsViolations: number;
}

export interface ClauseStatistic {
  clauseId: string;
  clauseTitle: string;
  shortRule: string;
  category: string;
  totalViolations: number;
  violationPercentage: number;
  severity: SeverityLevel;
  statutoryReference: string;
  commonDefectPattern: string;
}

export interface SellerHistoryItem {
  id: string;
  date: string;
  productName: string;
  brand: string;
  sku: string;
  category: string;
  status: ComplianceStatus;
  score: number;
  missingFieldsCount: number;
  imageUrl: string;
  memoId: string;
}

export interface FilterState {
  searchQuery: string;
  dateRange: 'all' | '7d' | '30d' | '90d' | 'ytd';
  clauseFilter: string;
  categoryFilter: string;
  statusFilter: 'ALL' | 'COMPLIANT' | 'NON_COMPLIANT' | 'FLAGGED_REVIEW';
  severityFilter: string;
}
