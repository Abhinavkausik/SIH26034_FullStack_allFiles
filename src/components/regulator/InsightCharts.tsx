import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { AlertOctagon, Layers, MessageSquare, Star } from 'lucide-react';
import { DashboardCharts } from '../../types';

const PRIORITY_COLORS: Record<string, string> = { HIGH: '#B42318', MEDIUM: '#B45309', LOW: '#5B6B84' };
const SPLIT_COLORS: Record<string, string> = {
  Compliant: '#1B7A43',
  'Non-compliant': '#B42318',
  'Needs review': '#B45309'
};

const CardShell: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children
}) => (
  <div className="rounded-xl border border-[#D6DEEA] bg-white p-4">
    <div className="mb-3 flex items-center gap-2">
      <span className="text-[#14224A]">{icon}</span>
      <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#14224A]">{title}</h3>
    </div>
    {children}
  </div>
);

/**
 * Five of the seven required charts: compliance split, issues detected vs
 * resolved, issues by category, issues by priority, complaints over time and
 * rating distribution. The sixth and seventh (compliance trend) reuse the
 * existing TrendCharts component so nothing already working is duplicated.
 */
export const InsightCharts: React.FC<{ charts: DashboardCharts }> = ({ charts }) => {
  const hasCategoryData = charts.issuesByCategory.some((c) => c.count > 0);
  const hasComplaintData = charts.complaintsOverTime.some((c) => c.total > 0);
  const hasRatingData = charts.ratingDistribution.some((r) => r.count > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CardShell title="Compliance vs non-compliance" icon={<Layers className="h-4 w-4" />}>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={charts.complianceSplit}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {charts.complianceSplit.map((entry) => (
                <Cell key={entry.name} fill={SPLIT_COLORS[entry.name] || '#8B99B0'} />
              ))}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </CardShell>

      <CardShell title="Issues detected vs resolved" icon={<AlertOctagon className="h-4 w-4" />}>
        {charts.issuesDetectedVsResolved.length === 0 ? (
          <EmptyChart label="No issue history yet." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={charts.issuesDetectedVsResolved}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="detected" name="Detected" fill="#B42318" radius={[3, 3, 0, 0]} />
              <Bar dataKey="resolved" name="Resolved" fill="#1B7A43" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardShell>

      <CardShell title="Issues by priority" icon={<AlertOctagon className="h-4 w-4" />}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={charts.issuesByPriority} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis type="category" dataKey="priority" tick={{ fontSize: 11, fontWeight: 700 }} width={60} />
            <Tooltip />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {charts.issuesByPriority.map((entry) => (
                <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority] || '#8B99B0'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardShell>

      <CardShell title="Issues by requirement category" icon={<Layers className="h-4 w-4" />}>
        {!hasCategoryData ? (
          <EmptyChart label="No non-compliant declarations recorded yet." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={charts.issuesByCategory} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
              <Tooltip />
              <Bar dataKey="count" fill="#B45309" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardShell>

      <CardShell title="Complaints over time" icon={<MessageSquare className="h-4 w-4" />}>
        {!hasComplaintData ? (
          <EmptyChart label="No complaints submitted yet." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={charts.complaintsOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="total" name="Total" stroke="#14224A" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#1B7A43" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardShell>

      <CardShell title="Consumer rating distribution" icon={<Star className="h-4 w-4" />}>
        {!hasRatingData ? (
          <EmptyChart label="No consumer ratings submitted yet." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={charts.ratingDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
              <XAxis dataKey="star" tickFormatter={(v) => `${v}★`} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#B45309" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardShell>
    </div>
  );
};

const EmptyChart: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex h-[180px] items-center justify-center text-center text-xs text-[#8B99B0]">{label}</div>
);
