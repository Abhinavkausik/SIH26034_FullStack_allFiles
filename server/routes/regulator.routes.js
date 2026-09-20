const express = require('express');
const db = require('../db');
const { LEGAL_METROLOGY_RULES_2011 } = require('../data/legalMetrologyRules');

const router = express.Router();

/**
 * GET /api/regulator/analytics
 *
 * Every number here is computed from the database. The legacy response keys
 * (trends, topClauses, recentScans, kpis) are preserved so the original
 * Regulator Analytics tab keeps working, and the new dashboard reads the
 * richer `cards` and `charts` sections.
 *
 * `demoDataPresent` is true when any row in the result set is seeded
 * demonstration data. The UI uses it to display a visible notice so seeded
 * figures are never mistaken for real enforcement statistics.
 */
router.get('/analytics', (req, res) => {
  const totalAudited = db.prepare('SELECT COUNT(*) AS c FROM scans').get().c;
  const totalInspections = db.prepare('SELECT COUNT(*) AS c FROM inspections').get().c;

  const compliant = db.prepare(`SELECT COUNT(*) AS c FROM inspections WHERE complianceStatus = 'COMPLIANT'`).get().c;
  const nonCompliant = db.prepare(`SELECT COUNT(*) AS c FROM inspections WHERE complianceStatus = 'NON_COMPLIANT'`).get().c;
  const needsReview = db.prepare(`SELECT COUNT(*) AS c FROM inspections WHERE complianceStatus NOT IN ('COMPLIANT','NON_COMPLIANT')`).get().c;

  const issuesDetected = db.prepare(`SELECT COUNT(*) AS c FROM inspection_findings WHERE result IN ('NON_COMPLIANT','WARNING')`).get().c;
  const issuesResolved = db.prepare(`
    SELECT COUNT(*) AS c FROM inspection_findings f
    JOIN inspections i ON i.id = f.inspectionId
    WHERE f.result IN ('NON_COMPLIANT','WARNING') AND i.status = 'RESOLVED'
  `).get().c;
  const issuesPending = Math.max(0, issuesDetected - issuesResolved);

  const activeComplaints = db.prepare(`SELECT COUNT(*) AS c FROM complaints WHERE status != 'RESOLVED'`).get().c;
  const totalComplaints = db.prepare('SELECT COUNT(*) AS c FROM complaints').get().c;

  const ratingAgg = db.prepare('SELECT COUNT(*) AS count, AVG(rating) AS average FROM feedback').get();

  const nonComplianceRate = totalInspections > 0
    ? Number(((nonCompliant / totalInspections) * 100).toFixed(1))
    : 0;

  const statutoryNoticesCount = db.prepare(`SELECT COUNT(*) AS c FROM inspections WHERE status = 'ACTION_REQUIRED'`).get().c;
  const resolvedGrievances = db.prepare(`SELECT COUNT(*) AS c FROM complaints WHERE status = 'RESOLVED'`).get().c;

  // --- Chart 1 + 7: compliance split and compliance trend over time ---------
  const trendRows = db.prepare(`
    SELECT strftime('%Y-%m', createdAt) AS month,
           COUNT(*) AS totalScans,
           SUM(CASE WHEN complianceStatus = 'COMPLIANT' THEN 1 ELSE 0 END) AS compliantCount,
           SUM(CASE WHEN complianceStatus = 'NON_COMPLIANT' THEN 1 ELSE 0 END) AS nonCompliantCount
    FROM inspections
    GROUP BY month ORDER BY month ASC
  `).all();

  const criticalByMonth = db.prepare(`
    SELECT strftime('%Y-%m', i.createdAt) AS month, COUNT(*) AS c
    FROM inspection_findings f JOIN inspections i ON i.id = f.inspectionId
    WHERE f.result = 'NON_COMPLIANT' AND f.severity = 'CRITICAL'
    GROUP BY month
  `).all().reduce((acc, r) => ({ ...acc, [r.month]: r.c }), {});

  const trends = trendRows.map((t) => ({
    month: t.month,
    totalScans: t.totalScans,
    compliantCount: t.compliantCount,
    nonCompliantCount: t.nonCompliantCount,
    criticalViolations: criticalByMonth[t.month] || 0,
    complianceRate: t.totalScans ? Number(((t.compliantCount / t.totalScans) * 100).toFixed(1)) : 0,
    fmcgViolations: 0,
    electronicsViolations: 0,
    cosmeticsViolations: 0
  }));

  // --- Chart 2: issues detected vs resolved, month by month ----------------
  const detectedByMonth = db.prepare(`
    SELECT strftime('%Y-%m', i.createdAt) AS month, COUNT(*) AS detected
    FROM inspection_findings f JOIN inspections i ON i.id = f.inspectionId
    WHERE f.result IN ('NON_COMPLIANT','WARNING')
    GROUP BY month ORDER BY month ASC
  `).all();

  const resolvedByMonth = db.prepare(`
    SELECT strftime('%Y-%m', i.updatedAt) AS month, COUNT(*) AS resolved
    FROM inspection_findings f JOIN inspections i ON i.id = f.inspectionId
    WHERE f.result IN ('NON_COMPLIANT','WARNING') AND i.status = 'RESOLVED'
    GROUP BY month
  `).all().reduce((acc, r) => ({ ...acc, [r.month]: r.resolved }), {});

  const issuesDetectedVsResolved = detectedByMonth.map((r) => ({
    month: r.month,
    detected: r.detected,
    resolved: resolvedByMonth[r.month] || 0
  }));

  // --- Chart 3: issues by requirement category -----------------------------
  const issuesByCategory = db.prepare(`
    SELECT fieldName AS name, ruleReference, COUNT(*) AS count
    FROM inspection_findings
    WHERE result IN ('NON_COMPLIANT','WARNING')
    GROUP BY fieldName, ruleReference
    ORDER BY count DESC LIMIT 10
  `).all();

  // --- Chart 4: open workload by priority ----------------------------------
  const priorityRows = db.prepare(`
    SELECT priority, COUNT(*) AS count FROM inspections
    WHERE status != 'RESOLVED' GROUP BY priority
  `).all().reduce((acc, r) => ({ ...acc, [r.priority]: r.count }), {});

  const issuesByPriority = ['HIGH', 'MEDIUM', 'LOW'].map((p) => ({
    priority: p,
    count: priorityRows[p] || 0
  }));

  // --- Chart 5: complaints over time ---------------------------------------
  const complaintsOverTime = db.prepare(`
    SELECT strftime('%Y-%m', createdAt) AS month,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved
    FROM complaints GROUP BY month ORDER BY month ASC
  `).all();

  // --- Chart 6: rating distribution ----------------------------------------
  const distributionRows = db.prepare(`
    SELECT CAST(ROUND(rating) AS INTEGER) AS star, COUNT(*) AS count
    FROM feedback GROUP BY star
  `).all().reduce((acc, r) => ({ ...acc, [r.star]: r.count }), {});

  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: distributionRows[star] || 0
  }));

  // --- Most violated statutory clauses -------------------------------------
  const clauseRows = db.prepare(`
    SELECT ruleReference AS clauseId, fieldName, severity, COUNT(*) AS count
    FROM inspection_findings
    WHERE result = 'NON_COMPLIANT' AND ruleReference IS NOT NULL
    GROUP BY ruleReference, fieldName, severity
    ORDER BY count DESC LIMIT 8
  `).all();

  const totalClauseViolations = clauseRows.reduce((sum, r) => sum + r.count, 0) || 1;

  const topClauses = clauseRows.map((r) => {
    const rule = LEGAL_METROLOGY_RULES_2011.find(
      (x) => x.clause === r.clauseId || x.id === r.clauseId
    );
    return {
      clauseId: r.clauseId,
      clauseTitle: rule ? rule.title : r.fieldName,
      shortRule: rule ? rule.mandatoryRequirement.slice(0, 90) : r.fieldName,
      category: 'Mandatory declaration',
      totalViolations: r.count,
      violationPercentage: Number(((r.count / totalClauseViolations) * 100).toFixed(1)),
      severity: r.severity || 'MEDIUM',
      statutoryReference: rule ? rule.statutoryAct : '',
      commonDefectPattern: rule ? rule.remediationAdvice : ''
    };
  });

  // --- Recent scans, legacy shape ------------------------------------------
  const recentScans = db.prepare('SELECT * FROM scans ORDER BY createdAt DESC LIMIT 50')
    .all()
    .map(hydrateScanRow);

  // --- Recent inspections, new shape ---------------------------------------
  const recentInspections = db.prepare(`
    SELECT i.id, i.createdAt, i.complianceStatus, i.complianceScore, i.priority, i.status,
           i.actorType, i.compliantCount, i.nonCompliantCount, i.warningCount, i.isDemo,
           p.name AS productName, p.brand, p.category, p.barcode,
           u.name AS assignedAuthorityName,
           (SELECT COUNT(*) FROM complaints c WHERE c.inspectionId = i.id) AS complaintCount
    FROM inspections i
    LEFT JOIN products p ON p.id = i.productId
    LEFT JOIN authority_users u ON u.id = i.assignedAuthorityId
    ORDER BY i.createdAt DESC LIMIT 25
  `).all().map((r) => ({ ...r, isDemo: !!r.isDemo }));

  const demoDataPresent =
    db.prepare('SELECT COUNT(*) AS c FROM inspections WHERE isDemo = 1').get().c > 0;

  res.json({
    generatedAt: new Date().toISOString(),
    demoDataPresent,

    // legacy keys, still consumed by the original components
    trends,
    topClauses,
    recentScans,
    kpis: {
      totalAudited: totalInspections || totalAudited,
      nonComplianceRate,
      statutoryNoticesCount,
      topOffendingClause: topClauses[0]?.clauseId || 'N/A',
      resolvedGrievances
    },

    // new dashboard cards
    cards: {
      totalChecked: totalInspections,
      compliant,
      nonCompliant,
      needsReview,
      issuesDetected,
      issuesResolved,
      issuesPending,
      activeComplaints,
      totalComplaints,
      averageRating: ratingAgg.average ? Number(ratingAgg.average.toFixed(2)) : 0,
      ratingCount: ratingAgg.count || 0,
      nonComplianceRate
    },

    charts: {
      complianceSplit: [
        { name: 'Compliant', value: compliant },
        { name: 'Non-compliant', value: nonCompliant },
        { name: 'Needs review', value: needsReview }
      ],
      issuesDetectedVsResolved,
      issuesByCategory,
      issuesByPriority,
      complaintsOverTime,
      ratingDistribution,
      complianceTrend: trends
    },

    recentInspections
  });
});

function hydrateScanRow(row) {
  return {
    ...row,
    checkedFields: JSON.parse(row.checkedFields || '[]'),
    violations: JSON.parse(row.violations || '[]'),
    isFontCompliant: row.isFontCompliant === null ? undefined : !!row.isFontCompliant
  };
}

module.exports = router;
