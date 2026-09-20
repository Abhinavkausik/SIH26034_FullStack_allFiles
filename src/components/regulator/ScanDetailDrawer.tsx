import React, { useState } from 'react';
import { X, ShieldAlert, CheckCircle2, AlertCircle, FileText, ExternalLink, Scale, Sparkles, Download } from 'lucide-react';
import { ScanResult, FieldComplianceResult, RuleClauseViolation } from '../../types';
import { StampBadge } from '../common/StampBadge';

interface ScanDetailDrawerProps {
  scan: ScanResult | null;
  isOpen: boolean;
  onClose: () => void;
  onGenerateNotice: (scan: ScanResult) => void;
  onOpenRulebookWithClause: (clauseId: string) => void;
}

export const ScanDetailDrawer: React.FC<ScanDetailDrawerProps> = ({
  scan,
  isOpen,
  onClose,
  onGenerateNotice,
  onOpenRulebookWithClause
}) => {
  const [selectedField, setSelectedField] = useState<FieldComplianceResult | null>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);

  if (!isOpen || !scan) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-[#EEF2F8] border-2 border-[#14224A] rounded-xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="bg-[#14224A] text-[#F3F6FB] px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-[#B42318] rounded text-white">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#B45309] font-bold">CASE AUDIT: {scan.id}</span>
                <span className="text-white/40">•</span>
                <span className="text-xs font-mono text-[#8B99B0]">{scan.category}</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold font-heading text-white">
                {scan.productTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onGenerateNotice(scan)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#B42318] hover:bg-[#B42318]/90 text-white font-mono text-xs font-bold rounded transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Draft Sec 36 Notice</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8B99B0] hover:text-[#F3F6FB] hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="p-6 overflow-y-auto blueprint-grid flex-1 space-y-6">
          {/* Top Summary Banner */}
          <div className="bg-white p-4 rounded-xl border border-[#D6DEEA] flex flex-col md:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <StampBadge
                status={scan.overallStatus}
                size="md"
                rotation={-4}
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase text-[#5B6B84]">Compliance Verdict:</span>
                  <span className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded ${
                    scan.overallStatus === 'COMPLIANT' ? 'bg-[#E7F5EC] text-[#1B7A43]' : 'bg-[#FCEAE8] text-[#B42318]'
                  }`}>
                    {scan.overallStatus} ({scan.complianceScore}/100)
                  </span>
                </div>
                <div className="text-xs text-[#14224A] font-medium mt-1">
                  Brand / Packer: <strong>{scan.brand}</strong> | Pack Type: <strong>{scan.packType}</strong>
                </div>
                <div className="text-[11px] font-mono text-[#5B6B84] mt-0.5">
                  Batch: {scan.batchNumber || 'N/A'} | Barcode: {scan.barcode || 'N/A'}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 text-right w-full md:w-auto border-t md:border-t-0 pt-2 md:pt-0 border-[#E3E9F2]">
              <span className="text-[10px] font-mono text-[#5B6B84] uppercase">ESTIMATED STATUTORY PENALTY</span>
              <strong className="text-sm font-mono text-[#B42318] bg-[#FCEAE8] px-2.5 py-1 rounded border border-[#B42318]/20">
                {scan.estimatedStatutoryFine}
              </strong>
              <span className="text-[10px] text-[#5B6B84] font-mono">
                Audit Ref: {scan.inspectionMemoNumber || 'AUTO-AUDIT'}
              </span>
            </div>
          </div>

          {/* Main Inspection Workbench (2 Columns: Label Evidence & Checked Fields) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Visual Label Evidence with Bounding Boxes */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono text-[#14224A] uppercase">
                  PHOTOGRAPHIC EVIDENCE & OCR ANNOTATIONS
                </span>
                <button
                  onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                  className="text-[11px] font-mono text-[#1B7A43] underline hover:text-[#14224A]"
                >
                  {showBoundingBoxes ? 'Hide Overlays' : 'Show Overlays'}
                </button>
              </div>

              <div className="relative bg-black/90 rounded-xl overflow-hidden border-2 border-[#14224A] shadow-md flex items-center justify-center min-h-[320px]">
                <img
                  src={scan.imageUrl}
                  alt={scan.productTitle}
                  className="w-full h-auto max-h-[380px] object-contain"
                />

                {/* Bounding Box Overlays */}
                {showBoundingBoxes && scan.checkedFields.map((field) => {
                  if (!field.boundingBox) return null;
                  const box = field.boundingBox;
                  const isSelected = selectedField?.fieldId === field.fieldId;
                  const boxColor = box.isCompliant ? 'border-[#1B7A43] bg-[#1B7A43]/20' : 'border-[#B42318] bg-[#B42318]/25';

                  return (
                    <div
                      key={field.fieldId}
                      onClick={() => setSelectedField(field)}
                      style={{
                        left: `${box.x}%`,
                        top: `${box.y}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                      }}
                      className={`absolute border-2 cursor-pointer transition-all ${boxColor} ${
                        isSelected ? 'ring-2 ring-yellow-400 scale-105 z-20' : 'z-10'
                      }`}
                    >
                      <span className={`absolute -top-5 left-0 text-[9px] font-mono font-bold px-1 py-0.2 rounded text-white whitespace-nowrap ${
                        box.isCompliant ? 'bg-[#1B7A43]' : 'bg-[#B42318]'
                      }`}>
                        {box.label}
                      </span>
                    </div>
                  );
                })}

                {/* Corner Calibrated Ticks */}
                <div className="absolute top-2 left-2 text-[8px] font-mono text-white/60 bg-black/60 px-1 rounded">
                  CALIBRATED OPTICAL INSPECTION
                </div>
              </div>

              <div className="p-3 bg-[#E3E9F2] rounded-lg border border-[#D6DEEA] text-[11px] font-mono text-[#5B6B84]">
                💡 <strong>Inspector Tip:</strong> Click any detected bounding box or rule in the right ledger to inspect extracted OCR text vs. legal requirement.
              </div>
            </div>

            {/* Right Column: 6 Mandatory Declarations Checklist */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between border-b border-[#D6DEEA] pb-2">
                <h3 className="font-bold text-sm text-[#14224A] font-heading flex items-center gap-2">
                  <span>Mandatory Declaration Audit Ledger (Rule 6)</span>
                </h3>
                <span className="text-xs font-mono text-[#5B6B84]">
                  {scan.checkedFields.filter(f => f.isPresent && !f.isMalformed).length} of 6 Declarations Compliant
                </span>
              </div>

              <div className="space-y-2.5">
                {scan.checkedFields.map((field) => {
                  const isPass = field.isPresent && !field.isMalformed;
                  const isSelected = selectedField?.fieldId === field.fieldId;

                  return (
                    <div
                      key={field.fieldId}
                      onClick={() => setSelectedField(field)}
                      className={`p-3.5 rounded-lg border transition-all cursor-pointer bg-white ${
                        isSelected
                          ? 'border-[#14224A] ring-2 ring-[#14224A]/20 shadow-sm'
                          : isPass
                          ? 'border-[#1B7A43]/30 hover:border-[#1B7A43]'
                          : 'border-[#B42318]/40 bg-[#FCEAE8]/40 hover:border-[#B42318]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isPass ? (
                            <CheckCircle2 className="w-4 h-4 text-[#1B7A43] shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-[#B42318] shrink-0" />
                          )}
                          <strong className="text-xs text-[#14224A]">{field.fieldName}</strong>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenRulebookWithClause(field.ruleReference);
                            }}
                            className="text-[10px] font-mono text-[#1B7A43] hover:underline"
                          >
                            {field.ruleReference}
                          </button>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                            isPass ? 'bg-[#E7F5EC] text-[#1B7A43]' : 'bg-[#FCEAE8] text-[#B42318]'
                          }`}>
                            {isPass ? 'PASS' : field.isPresent ? 'MALFORMED' : 'MISSING'}
                          </span>
                        </div>
                      </div>

                      {/* Explanation & Detected Text */}
                      <p className="text-xs text-[#5B6B84] mt-1.5 ml-6">
                        {field.explanation}
                      </p>

                      {field.detectedText && (
                        <div className="mt-2 ml-6 p-2 bg-[#EEF2F8] rounded text-[11px] font-mono text-[#14224A] border border-[#E3E9F2]">
                          <span className="text-[#5B6B84] block text-[9px] uppercase font-semibold">Detected Text on Package:</span>
                          "{field.detectedText}"
                        </div>
                      )}

                      {!isPass && (
                        <div className="mt-2 ml-6 text-[10px] font-mono text-[#B42318] font-medium">
                          Required Standard: {field.expectedFormat}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Statutory Violations & Remedies Section */}
              {scan.violations.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#D6DEEA]">
                  <h4 className="font-bold text-xs font-mono text-[#B42318] uppercase mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Statutory Penal Sections Charged ({scan.violations.length})</span>
                  </h4>
                  <div className="space-y-2">
                    {scan.violations.map((v, i) => (
                      <div key={i} className="p-3 bg-[#FCEAE8] rounded-lg border border-[#B42318]/30 text-xs">
                        <div className="flex items-center justify-between font-mono font-bold text-[#B42318] mb-1">
                          <span>{v.clauseId}: {v.clauseTitle}</span>
                          <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-[#B42318]/20">{v.statutoryAct}</span>
                        </div>
                        <p className="text-[#14224A] text-[11px]">{v.violationReason}</p>
                        <div className="mt-1.5 text-[10px] font-mono text-[#5B6B84]">
                          <strong>Remediation: </strong>{v.remediationAdvice}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="bg-[#E3E9F2] px-6 py-3 border-t border-[#D6DEEA] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-[#5B6B84] font-mono text-[11px]">
            Audit memo generated under Legal Metrology Act, 2009 Standards
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onGenerateNotice(scan)}
              className="px-4 py-1.5 bg-[#B42318] hover:bg-[#B42318]/90 text-white font-mono font-semibold rounded text-xs transition-colors flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Generate Form-A Inspection Memo</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-[#14224A] text-[#F3F6FB] font-semibold rounded text-xs hover:bg-[#14224A]/90"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
