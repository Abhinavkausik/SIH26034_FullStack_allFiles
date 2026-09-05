import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert, FileDown, LogOut, Loader2, CheckCircle2, Clock, Send, AlertTriangle, FileText
} from 'lucide-react';
import { AuthorityUser, authorityLogout } from '../../services/authApi';
import {
  fetchAuthoritySummary, fetchViolationsQueue, takeAction, downloadReport,
  AuthorityScan, AuthoritySummary, ActionStatus
} from '../../services/authorityApi';

interface AuthorityPortalProps {
  user: AuthorityUser;
  onLogout: () => void;
  onOpenDocument?: (scanId: string) => void;
}

const STATUS_LABELS: Record<ActionStatus, string> = {
  PENDING: 'Pending Review',
  UNDER_REVIEW: 'Under Review',
  NOTICE_ISSUED: 'Notice Issued',
  RESOLVED: 'Resolved'
};

const STATUS_COLORS: Record<ActionStatus, string> = {
  PENDING: 'bg-[#FBEAE8] text-[#B42318] border-[#B42318]/30',
  UNDER_REVIEW: 'bg-[#FDF3E4] text-[#B45309] border-[#B45309]/30',
  NOTICE_ISSUED: 'bg-[#EAF0FB] text-[#2C5AA0] border-[#2C5AA0]/30',
  RESOLVED: 'bg-[#E7F5EC] text-[#1B7A43] border-[#1B7A43]/30'
};

export const AuthorityPortal: React.FC<AuthorityPortalProps> = ({ user, onLogout, onOpenDocument }) => {
  const [summary, setSummary] = useState<AuthoritySummary | null>(null);
  const [scans, setScans] = useState<AuthorityScan[]>([]);
  const [filterStatus, setFilterStatus] = useState<ActionStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, queueData] = await Promise.all([
        fetchAuthoritySummary(),
        fetchViolationsQueue(filterStatus)
      ]);
      setSummary(summaryData);
      setScans(queueData);
    } catch (err: any) {
      setError(err.message || 'Failed to load authority data. Your session may have expired.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAction = async (scanId: string, action: ActionStatus) => {
    setActingOnId(scanId);
    try {
      await takeAction(scanId, action, notesDraft[scanId]);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update this scan.');
    } finally {
      setActingOnId(null);
    }
  };

  const handleDownload = async (scan: AuthorityScan) => {
    try {
      await downloadReport(scan.id, scan.productTitle);
    } catch (err: any) {
      setError(err.message || 'Report not available for this scan.');
    }
  };

  const handleLogout = () => {
    authorityLogout();
    onLogout();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#14224A] text-[#F3F6FB] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-[#B45309]/20 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-[#B45309]" />
          </div>
          <div>
            <p className="text-[10px] font-mono tracking-wider text-[#8B99B0]">PRIVATE &middot; AUTHORITY PORTAL</p>
            <h2 className="text-lg font-bold font-heading">Welcome, {user.name}</h2>
            {user.designation && <p className="text-xs text-[#8B99B0]">{user.designation}</p>}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#F3F6FB]/30 hover:bg-[#F3F6FB]/10 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Log Out</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-[#FBEAE8] border border-[#B42318]/30 text-[#B42318] text-sm rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Pending Review" value={summary.pending} color="#B42318" icon={<Clock className="w-4 h-4" />} />
          <SummaryCard label="Under Review" value={summary.underReview} color="#B45309" icon={<Loader2 className="w-4 h-4" />} />
          <SummaryCard label="Notices Issued" value={summary.noticesIssued} color="#2C5AA0" icon={<Send className="w-4 h-4" />} />
          <SummaryCard label="Resolved" value={summary.resolved} color="#1B7A43" icon={<CheckCircle2 className="w-4 h-4" />} />
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['ALL', 'PENDING', 'UNDER_REVIEW', 'NOTICE_ISSUED', 'RESOLVED'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
              filterStatus === s
                ? 'bg-[#14224A] text-[#F3F6FB] border-[#14224A]'
                : 'bg-white text-[#5B6B84] border-[#D6DEEA] hover:bg-[#EEF2F8]'
            }`}
          >
            {s === 'ALL' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Violations queue */}
      <div className="bg-[#EEF2F8] rounded-xl border border-[#D6DEEA] overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-[#5B6B84] gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading violation queue...</span>
          </div>
        ) : scans.length === 0 ? (
          <div className="p-10 text-center text-[#5B6B84] text-sm">No scans in this category yet.</div>
        ) : (
          <div className="divide-y divide-[#D6DEEA]">
            {scans.map(scan => (
              <div key={scan.id} className="p-5 flex flex-col gap-3">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-[#14224A]">{scan.productTitle}</h3>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${STATUS_COLORS[scan.actionStatus]}`}>
                        {STATUS_LABELS[scan.actionStatus]}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FBEAE8] text-[#B42318] border border-[#B42318]/30">
                        {scan.overallStatus}
                      </span>
                    </div>
                    <p className="text-xs text-[#5B6B84] mt-1">
                      {scan.brand || 'Unknown Brand'} &middot; {scan.category || 'Uncategorized'} &middot; Score {scan.complianceScore}/100
                    </p>
                    <p className="text-[11px] font-mono text-[#8B99B0] mt-0.5">
                      Scan ID: {scan.id} &middot; Submitted by: {scan.submittedBy} &middot; {new Date(scan.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {onOpenDocument && (
                      <button
                        onClick={() => onOpenDocument(scan.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#D6DEEA] bg-white text-[#14224A] hover:bg-[#EEF2F8] transition-colors whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View Compliance Document</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDownload(scan)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#14224A] text-[#F3F6FB] hover:bg-[#14224A]/90 transition-colors whitespace-nowrap"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Download Failure & Improvement Report</span>
                    </button>
                  </div>
                </div>

                {/* Violations preview */}
                <div className="flex flex-wrap gap-1.5">
                  {scan.violations.slice(0, 4).map((v, i) => (
                    <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EEF2F8] border border-[#D6DEEA] text-[#5B6B84]">
                      {v.clauseId}
                    </span>
                  ))}
                  {scan.violations.length > 4 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 text-[#8B99B0]">+{scan.violations.length - 4} more</span>
                  )}
                </div>

                {/* Action controls */}
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center pt-2 border-t border-[#F3F6FB]">
                  <input
                    type="text"
                    placeholder="Add a note for this action (optional)"
                    value={notesDraft[scan.id] || ''}
                    onChange={(e) => setNotesDraft(prev => ({ ...prev, [scan.id]: e.target.value }))}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-[#D6DEEA] bg-white focus:outline-none focus:ring-2 focus:ring-[#14224A]/20"
                  />
                  <div className="flex gap-2">
                    {(['UNDER_REVIEW', 'NOTICE_ISSUED', 'RESOLVED'] as ActionStatus[]).map(action => (
                      <button
                        key={action}
                        disabled={actingOnId === scan.id || scan.actionStatus === action}
                        onClick={() => handleAction(scan.id, action)}
                        className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-[#D6DEEA] bg-white text-[#14224A] hover:bg-[#EEF2F8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                      >
                        {actingOnId === scan.id ? '...' : STATUS_LABELS[action]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: number; color: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
  <div className="bg-white p-4 rounded-lg border border-[#D6DEEA] shadow-xs">
    <div className="flex items-center justify-between text-[#5B6B84] text-xs font-mono">
      <span>{label.toUpperCase()}</span>
      <span style={{ color }}>{icon}</span>
    </div>
    <div className="text-2xl font-bold font-mono mt-1.5" style={{ color }}>{value}</div>
  </div>
);
