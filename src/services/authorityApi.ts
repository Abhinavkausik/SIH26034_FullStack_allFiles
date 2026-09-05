import { ScanResult } from '../types';
import { API_BASE, authHeader, authorityLogout } from './authApi';

async function authorityFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}/authority${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeader() }
  });

  if (res.status === 401) {
    // Session expired or invalid - clear it so the login screen shows again
    authorityLogout();
  }

  return res;
}

export interface AuthoritySummary {
  pending: number;
  underReview: number;
  noticesIssued: number;
  resolved: number;
}

export type ActionStatus = 'PENDING' | 'UNDER_REVIEW' | 'NOTICE_ISSUED' | 'RESOLVED';

export interface AuthorityScan extends ScanResult {
  submittedBy: string;
  actionStatus: ActionStatus;
  actionNotes?: string;
  reportPath?: string;
}

export async function fetchAuthoritySummary(): Promise<AuthoritySummary> {
  const res = await authorityFetch('/summary');
  if (!res.ok) throw new Error('Failed to load authority summary.');
  return res.json();
}

export async function fetchViolationsQueue(status: ActionStatus | 'ALL' = 'ALL'): Promise<AuthorityScan[]> {
  const res = await authorityFetch(`/violations?status=${status}`);
  if (!res.ok) throw new Error('Failed to load violations queue.');
  return res.json();
}

export async function takeAction(scanId: string, action: ActionStatus, notes?: string): Promise<void> {
  const res = await authorityFetch(`/violations/${scanId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, notes })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update action status.' }));
    throw new Error(err.error);
  }
}

export function downloadReportUrl(scanId: string): string {
  // The browser needs the token attached; res.download on a plain <a href>
  // won't carry the Authorization header, so callers should use downloadReport().
  return `${API_BASE}/authority/reports/${scanId}`;
}

export async function downloadReport(scanId: string, productTitle?: string): Promise<void> {
  const res = await authorityFetch(`/reports/${scanId}`);
  if (!res.ok) throw new Error('No report available for this scan.');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Compliance-Report-${productTitle || scanId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
