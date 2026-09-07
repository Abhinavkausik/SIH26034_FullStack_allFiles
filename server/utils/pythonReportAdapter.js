/**
 * Adapts the Python AI compliance report to the frontend expected ScanResult format.
 *
 * @param {Object} pythonReport - The JSON object from the Python engine.
 * @returns {Object} - The ScanResult object expected by the frontend.
 */

/**
 * Convert a 4-point pixel quadrilateral (PaddleOCR format) to an axis-aligned
 * percentage bounding box for the ScanDetailDrawer overlay.
 *
 * Returns null when:
 *   - points is missing or not a 4-element array
 *   - image dimensions are zero or absent
 * Never invents coordinates.
 *
 * @param {Array} points - [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] in absolute pixels
 * @param {number} imgW  - image width in pixels
 * @param {number} imgH  - image height in pixels
 * @param {string} label - field label for the overlay
 * @param {boolean} isCompliant
 * @returns {{ x, y, width, height, label, isCompliant } | null}
 */
function pxQuadToPercentBox(points, imgW, imgH, label, isCompliant) {
  if (!Array.isArray(points) || points.length < 4) return null;
  if (!imgW || !imgH || imgW <= 0 || imgH <= 0) return null;

  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);

  // Clamp to image bounds
  const x = Math.max(0, (xMin / imgW) * 100);
  const y = Math.max(0, (yMin / imgH) * 100);
  const width = Math.min(100 - x, ((xMax - xMin) / imgW) * 100);
  const height = Math.min(100 - y, ((yMax - yMin) / imgH) * 100);

  if (width <= 0 || height <= 0) return null;

  return { x, y, width, height, label, isCompliant };
}

/**
 * Extract the best available BoundingBox from a Python evidence array.
 * Returns null if evidence is empty or has no usable bbox.
 *
 * @param {Array}   evidence   - array of serialised OCRText objects
 * @param {number}  imgW       - image width in pixels
 * @param {number}  imgH       - image height in pixels
 * @param {string}  label      - field label for the overlay
 * @param {boolean} isCompliant
 * @returns {{ x, y, width, height, label, isCompliant } | null}
 */
function extractBoundingBox(evidence, imgW, imgH, label, isCompliant) {
  if (!Array.isArray(evidence) || evidence.length === 0) return null;
  const first = evidence[0];
  if (!first || !first.bbox || !first.bbox.points) return null;
  return pxQuadToPercentBox(first.bbox.points, imgW, imgH, label, isCompliant);
}

function adaptPythonReportToScanResult(pythonReport) {
  const overallStatus = pythonReport.overall_decision || "FLAGGED_REVIEW";
  const imgW = pythonReport.image_width_px || 0;
  const imgH = pythonReport.image_height_px || 0;

  const checkedFields = [];

  const formatFieldName = (str) => {
    if (!str) return "";
    return str.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const createField = (fieldStr, status, explanation) => {
    return {
      fieldId: fieldStr,
      fieldName: formatFieldName(fieldStr),
      ruleReference: "",
      status: status,
      isPresent: status === "FOUND",
      isMalformed: status === "LOW_CONFIDENCE",
      expectedFormat: "",
      explanation: explanation,
      severity: "LOW"
    };
  };

  const createObjectField = (obj, status) => {
    let finalStatus = status;
    if (obj.message && obj.message.includes("AI analysis was unavailable")) {
      finalStatus = "AI_UNAVAILABLE";
    }

    const isCompliant = finalStatus === "FOUND";
    const label = formatFieldName(obj.field);
    const boundingBox = extractBoundingBox(obj.evidence || [], imgW, imgH, label, isCompliant);

    return {
      fieldId: obj.field || "",
      fieldName: label,
      ruleReference: obj.rule_clause || "",
      status: finalStatus,
      isPresent: finalStatus === "FOUND",
      isMalformed: finalStatus === "LOW_CONFIDENCE",
      expectedFormat: "",
      explanation: obj.message || "",
      severity: "MEDIUM",
      boundingBox: boundingBox || undefined
    };
  };

  (pythonReport.passed_fields || []).forEach(f => {
    checkedFields.push(createField(f, "FOUND", "Passed"));
  });

  (pythonReport.needs_review || []).forEach(f => {
    checkedFields.push(createObjectField(f, "LOW_CONFIDENCE"));
  });

  (pythonReport.violations || []).forEach(f => {
    checkedFields.push(createObjectField(f, "NOT_FOUND"));
  });

  (pythonReport.not_applicable_fields || []).forEach(f => {
    checkedFields.push(createField(f, "NOT_APPLICABLE", "Not applicable"));
  });

  const violations = (pythonReport.violations || []).map(v => ({
    clauseId: v.rule_clause || "",
    clauseTitle: formatFieldName(v.field),
    ruleBook: "",
    description: "",
    violationReason: v.message || "",
    mandatoryRequirement: "",
    statutoryAct: "",
    penaltyDescription: "",
    penaltySection: "",
    severity: "MEDIUM",
    remediationAdvice: ""
  }));

  let inspectorNotes = null;
  if (pythonReport.summary) {
    if (typeof pythonReport.summary === "object") {
      inspectorNotes = `Passed: ${pythonReport.summary.passed}, Violations: ${pythonReport.summary.violations}, Needs Review: ${pythonReport.summary.needs_review}, N/A: ${pythonReport.summary.not_applicable}`;
    } else {
      inspectorNotes = String(pythonReport.summary);
    }
  }

  return {
    id: `LM-${Date.now()}`,
    timestamp: new Date().toISOString(),
    productTitle: null,
    brand: null,
    category: pythonReport.category || null,
    packType: null,
    batchNumber: null,
    barcode: null,
    imageUrl: "",
    overallStatus,
    complianceScore: null,
    checkedFields,
    violations,
    principalDisplayAreaCm2: null,
    minimumFontHeightMm: null,
    detectedFontHeightMm: null,
    isFontCompliant: undefined,
    inspectorNotes,
    inspectionMemoNumber: null,
    estimatedStatutoryFine: null,
    submittedBy: "system",
    reportPath: null,
    actionStatus: "PENDING"
  };
}

module.exports = { adaptPythonReportToScanResult };
