/**
 * Adapts the Python AI compliance report to the frontend's expected ScanResult format.
 * 
 * @param {Object} pythonReport - The JSON object from the Python engine.
 * @returns {Object} - The ScanResult object expected by the frontend.
 */
function adaptPythonReportToScanResult(pythonReport) {
  const overallStatus = pythonReport.overall_decision || 'FLAGGED_REVIEW';

  const checkedFields = [];
  
  const formatFieldName = (str) => {
    if (!str) return '';
    return str.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const createField = (fieldStr, status, explanation) => {
    return {
      fieldId: fieldStr,
      fieldName: formatFieldName(fieldStr),
      ruleReference: '',
      status: status,
      isPresent: status === 'FOUND',
      isMalformed: status === 'LOW_CONFIDENCE',
      expectedFormat: '',
      explanation: explanation,
      severity: 'LOW' // Must provide a valid SeverityLevel enum value, LOW is safest default
    };
  };

  const createObjectField = (obj, status) => {
    // If the message contains "AI analysis was unavailable", map to AI_UNAVAILABLE
    let finalStatus = status;
    if (obj.message && obj.message.includes('AI analysis was unavailable')) {
      finalStatus = 'AI_UNAVAILABLE';
    }
    
    return {
      fieldId: obj.field || '',
      fieldName: formatFieldName(obj.field),
      ruleReference: obj.rule_clause || '',
      status: finalStatus,
      isPresent: finalStatus === 'FOUND',
      isMalformed: finalStatus === 'LOW_CONFIDENCE',
      expectedFormat: '',
      explanation: obj.message || '',
      severity: 'MEDIUM' // Safest default for warnings/violations when unknown
    };
  };

  (pythonReport.passed_fields || []).forEach(f => {
    checkedFields.push(createField(f, 'FOUND', 'Passed'));
  });

  (pythonReport.needs_review || []).forEach(f => {
    checkedFields.push(createObjectField(f, 'LOW_CONFIDENCE'));
  });

  (pythonReport.violations || []).forEach(f => {
    checkedFields.push(createObjectField(f, 'NOT_FOUND'));
  });

  (pythonReport.not_applicable_fields || []).forEach(f => {
    checkedFields.push(createField(f, 'NOT_APPLICABLE', 'Not applicable'));
  });

  const violations = (pythonReport.violations || []).map(v => ({
    clauseId: v.rule_clause || '',
    clauseTitle: formatFieldName(v.field),
    ruleBook: '',
    description: '',
    violationReason: v.message || '',
    mandatoryRequirement: '',
    statutoryAct: '',
    penaltyDescription: '',
    penaltySection: '',
    severity: 'MEDIUM', // Safest enum default
    remediationAdvice: ''
  }));

  let inspectorNotes = null;
  if (pythonReport.summary) {
    if (typeof pythonReport.summary === 'object') {
      inspectorNotes = `Passed: ${pythonReport.summary.passed}, Violations: ${pythonReport.summary.violations}, Needs Review: ${pythonReport.summary.needs_review}, N/A: ${pythonReport.summary.not_applicable}`;
    } else {
      inspectorNotes = String(pythonReport.summary);
    }
  }

  const complianceScore = null;

  return {
    id: `LM-${Date.now()}`,
    timestamp: new Date().toISOString(),
    productTitle: null,
    brand: null,
    category: pythonReport.category || null,
    packType: null,
    batchNumber: null,
    barcode: null,
    imageUrl: '', 
    overallStatus,
    complianceScore,
    checkedFields,
    violations,
    principalDisplayAreaCm2: null,
    minimumFontHeightMm: null,
    detectedFontHeightMm: null,
    isFontCompliant: undefined,
    inspectorNotes,
    inspectionMemoNumber: null,
    estimatedStatutoryFine: null,
    submittedBy: 'system',
    reportPath: null,
    actionStatus: 'PENDING'
  };
}

module.exports = { adaptPythonReportToScanResult };
