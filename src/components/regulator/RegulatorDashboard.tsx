import React, { useState } from 'react';
import { ScanResult, RegulatorAnalytics, FilterState } from '../../types';
import { TrendCharts } from './TrendCharts';
import { ViolatedClausesTable } from './ViolatedClausesTable';
import { NonCompliantScansLedger } from './NonCompliantScansLedger';
import { ScanDetailDrawer } from './ScanDetailDrawer';
import { InsightCharts } from './InsightCharts';
import { InspectionMemoModal } from '../common/InspectionMemoModal';
import { DemoDataNotice } from '../common/StatusIndicators';
import {
  ShieldCheck, ShieldAlert, FileText, Scale, AlertOctagon, CheckCircle2,
  ClipboardCheck, Star, Loader2
} from 'lucide-react';

interface RegulatorDashboardProps {
  analytics: RegulatorAnalytics | null;
  loading: boolean;
  onOpenRulebookWithClause: (clauseId: string) => void;
}

export const RegulatorDashboard: React.FC<RegulatorDashboardProps> = ({
  analytics,
  loading,
  onOpenRulebookWithClause
}) => {
  const [selectedScanForDrawer, setSelectedScanForDrawer] = useState<ScanResult | null>(null);
  const [selectedScanForMemo, setSelectedScanForMemo] = useState<ScanResult | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    dateRange: 'all',
    clauseFilter: 'all',
    categoryFilter: 'all',
    statusFilter: 'ALL',
    severityFilter: 'all'
  });

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleSelectClauseFilter = (clauseId: string) => {
    setFilters(prev => ({ ...prev, clauseFilter: clauseId }));
  };

  const scans = analytics?.recentScans || [];
  const trends = analytics?.trends || [];
  const topClauses = analytics?.topClauses || [];
  const cards = analytics?.cards;
  const charts = analytics?.charts;

  if (loading && !analytics) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-[#D6DEEA] bg-[#EEF2F8] py-24 text-[#5B6B84]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading regulatory intelligence...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Regulator Executive Ledger Header */}
      <div className="bg-[#EEF2F8] p-5 rounded-xl border border-[#D6DEEA] shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#D6DEEA] pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-[#14224A] text-[#F3F6FB] font-mono font-bold text-xs rounded">
                NATIONAL REGULATORY ENFORCEMENT PORTAL
              </span>
              <span className="text-xs font-mono text-[#5B6B84]">PCR 2011 STATUTORY SURVEILLANCE</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-heading text-[#14224A] mt-1">
              Legal Metrology Compliance & Inspection Intelligence
            </h2>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E7F5EC] text-[#1B7A43] rounded border border-[#1B7A43]/30 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>AI Inspection Active</span>
            </div>
          </div>
        </div>

        {analytics?.demoDataPresent && <DemoDataNotice className="mb-4" />}

        {/* 8 Primary KPI Ledger Cards, computed from the database */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Checked"
            value={cards ? cards.totalChecked.toLocaleString() : '—'}
            icon={<Scale className="w-4 h-4 text-[#14224A]" />}
          />
          <KpiCard
            label="Compliant"
            value={cards ? cards.compliant.toLocaleString() : '—'}
            icon={<CheckCircle2 className="w-4 h-4 text-[#1B7A43]" />}
            valueClassName="text-[#1B7A43]"
          />
          <KpiCard
            label="Non-Compliant"
            value={cards ? cards.nonCompliant.toLocaleString() : '—'}
            icon={<AlertOctagon className="w-4 h-4 text-[#B42318]" />}
            valueClassName="text-[#B42318]"
            sub={cards ? `${cards.nonComplianceRate}% of checked packages` : undefined}
          />
          <KpiCard
            label="Issues Detected"
            value={cards ? cards.issuesDetected.toLocaleString() : '—'}
            icon={<ShieldAlert className="w-4 h-4 text-[#B45309]" />}
          />
          <KpiCard
            label="Issues Resolved"
            value={cards ? cards.issuesResolved.toLocaleString() : '—'}
            icon={<CheckCircle2 className="w-4 h-4 text-[#1B7A43]" />}
            valueClassName="text-[#1B7A43]"
          />
          <KpiCard
            label="Pending Issues"
            value={cards ? cards.issuesPending.toLocaleString() : '—'}
            icon={<ClipboardCheck className="w-4 h-4 text-[#B45309]" />}
          />
          <KpiCard
            label="Active Complaints"
            value={cards ? cards.activeComplaints.toLocaleString() : '—'}
            icon={<FileText className="w-4 h-4 text-[#B42318]" />}
            sub={cards ? `${cards.totalComplaints} total filed` : undefined}
          />
          <KpiCard
            label="Average Rating"
            value={cards ? cards.averageRating.toFixed(1) : '—'}
            icon={<Star className="w-4 h-4 text-[#B45309]" />}
            sub={cards ? `${cards.ratingCount} consumer ratings` : undefined}
          />
        </div>
      </div>

      {/* Interface Section 1: Trend Charts (existing) */}
      <TrendCharts data={trends} />

      {/* Interface Section 2: New insight charts - priority, category, complaints, ratings */}
      {charts && <InsightCharts charts={charts} />}

      {/* Interface Section 3: Most-Violated Clauses Table */}
      <ViolatedClausesTable
        clauses={topClauses}
        selectedClauseFilter={filters.clauseFilter}
        onSelectClause={handleSelectClauseFilter}
        onOpenRulebookWithClause={onOpenRulebookWithClause}
      />

      {/* Interface Section 4: Recent Non-Compliant Audits Ledger with Filters */}
      <NonCompliantScansLedger
        scans={scans}
        filters={filters}
        onFilterChange={handleFilterChange}
        onSelectScan={(scan) => setSelectedScanForDrawer(scan)}
        onGenerateNotice={(scan) => setSelectedScanForMemo(scan)}
      />

      {/* Modals & Inspection Drawers */}
      <ScanDetailDrawer
        scan={selectedScanForDrawer}
        isOpen={!!selectedScanForDrawer}
        onClose={() => setSelectedScanForDrawer(null)}
        onGenerateNotice={(scan) => {
          setSelectedScanForDrawer(null);
          setSelectedScanForMemo(scan);
        }}
        onOpenRulebookWithClause={onOpenRulebookWithClause}
      />

      <InspectionMemoModal
        scan={selectedScanForMemo}
        isOpen={!!selectedScanForMemo}
        onClose={() => setSelectedScanForMemo(null)}
      />
    </div>
  );
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClassName?: string;
  sub?: string;
}> = ({ label, value, icon, valueClassName, sub }) => (
  <div className="bg-white p-4 rounded-lg border border-[#D6DEEA] shadow-xs">
    <div className="flex items-center justify-between text-[#5B6B84] text-[11px] font-mono">
      <span>{label.toUpperCase()}</span>
      {icon}
    </div>
    <div className={`text-2xl font-bold font-mono mt-1.5 text-[#14224A] ${valueClassName || ''}`}>{value}</div>
    {sub && <div className="text-[10px] text-[#8B99B0] font-mono mt-1">{sub}</div>}
  </div>
);
