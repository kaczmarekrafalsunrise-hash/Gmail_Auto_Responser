'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Thread } from '@/lib/api';

export const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'interested', label: 'Interested', dot: 'interested' },
  { id: 'not_interested', label: 'Not Interested', dot: 'not_interested' },
  { id: 'meeting_request', label: 'Meeting Request', dot: 'meeting_request' },
  { id: 'unclear', label: 'Unclear', dot: 'unclear' },
] as const;

export function timeAgo(iso?: string) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function senderName(fromEmail?: string) {
  if (!fromEmail) return 'Unknown sender';
  const local = fromEmail.split('@')[0] ?? fromEmail;
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function avatarColor(email?: string) {
  if (!email) return '#6366f1';
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const hues = ['#6366f1', '#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706'];
  return hues[Math.abs(hash) % hues.length];
}

export function draftStatusLabel(draft?: { status: string }) {
  if (!draft) return null;
  if (draft.status === 'sent') return { text: 'Auto-Responded', tone: 'success' };
  if (draft.status === 'pending_approval') return { text: 'Needs Review', tone: 'warning' };
  if (draft.status === 'approved') return { text: 'Draft Ready', tone: 'info' };
  return { text: draft.status.replace('_', ' '), tone: 'muted' };
}

export function filterThreads(
  items: Thread[],
  labelFilter: string,
  statusFilter: string | null,
  query: string,
) {
  const q = query.trim().toLowerCase();
  return items.filter((thread) => {
    const latest = thread.messages?.[thread.messages.length - 1];
    const classification = latest?.classification;
    const draft = latest?.draft_reply;

    if (statusFilter === 'pending' && draft?.status !== 'pending_approval') return false;
    if (labelFilter !== 'all' && classification?.label !== labelFilter) return false;

    if (q) {
      const haystack = `${thread.subject ?? ''} ${thread.snippet ?? ''} ${latest?.from_email ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

type Props = {
  threads: Thread[];
  loading?: boolean;
  limit?: number;
  showFilters?: boolean;
  showFooter?: boolean;
  compact?: boolean;
};

export function ConversationList({
  threads,
  loading,
  limit,
  showFilters = true,
  showFooter = false,
  compact = false,
}: Props) {
  const searchParams = useSearchParams();
  const labelFilter = searchParams.get('label') ?? 'all';
  const statusFilter = searchParams.get('status');
  const query = searchParams.get('q') ?? '';

  const filtered = filterThreads(threads, labelFilter, statusFilter, query);
  const visible = limit ? filtered.slice(0, limit) : filtered;

  function tabHref(tabId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (tabId === 'all') params.delete('label');
    else params.set('label', tabId);
    params.delete('status');
    const qs = params.toString();
    return qs ? `/threads?${qs}` : '/threads';
  }

  if (loading) {
    return (
      <div className="page-loader page-loader--compact">
        <div className="page-loader__bar" aria-hidden="true">
          <div className="page-loader__bar-fill" />
        </div>
        <p className="page-loader__text">Loading conversations...</p>
      </div>
    );
  }

  return (
    <>
      {showFilters && statusFilter !== 'pending' && (
        <div className="filter-tabs">
          {FILTER_TABS.map((tab) => (
            <Link
              key={tab.id}
              href={tabHref(tab.id)}
              className={`filter-tab${labelFilter === tab.id ? ' active' : ''}`}
            >
              {'dot' in tab && tab.dot && <span className={`filter-dot filter-dot--${tab.dot}`} />}
              {tab.label}
            </Link>
          ))}
        </div>
      )}

      {statusFilter === 'pending' && (
        <p className="panel-subtext">Showing drafts awaiting your approval.</p>
      )}

      <div className={`conversation-list${compact ? ' conversation-list--compact' : ''}`}>
        {visible.map((thread) => {
          const latest = thread.messages?.[thread.messages.length - 1];
          const classification = latest?.classification;
          const draft = latest?.draft_reply;
          const status = draftStatusLabel(draft);
          const email = latest?.from_email;
          const initials = senderName(email)
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          return (
            <Link key={thread.id} href={`/threads/${thread.id}`} className="conversation-row">
              <div className="conversation-avatar" style={{ background: avatarColor(email) }}>
                {initials}
              </div>
              <div className="conversation-body">
                <div className="conversation-top">
                  <strong>{senderName(email)}</strong>
                  <span className="conversation-time">{timeAgo(thread.last_message_at)}</span>
                </div>
                <p className="conversation-subject">{thread.subject || '(no subject)'}</p>
                <p className="conversation-snippet">{thread.snippet}</p>
                <div className="conversation-tags">
                  {classification && (
                    <span className={`badge badge-${classification.label}`}>
                      {classification.label.replace('_', ' ')}
                    </span>
                  )}
                  {!classification && !draft && <span className="badge badge-unclear">Processing</span>}
                </div>
              </div>
              <div className="conversation-status">
                {status && <span className={`status-pill status-pill--${status.tone}`}>{status.text}</span>}
                <span className="conversation-chevron" aria-hidden="true" />
              </div>
            </Link>
          );
        })}
      </div>

      {!visible.length && (
        <p className="empty-inline">
          {query || labelFilter !== 'all' || statusFilter
            ? 'No conversations match your filters.'
            : 'No threads yet. Connect Gmail and send a test email.'}
        </p>
      )}

      {showFooter && (
        <div className="panel-footer">
          <Link href="/threads" className="btn btn-secondary btn-sm">
            View all conversations
          </Link>
        </div>
      )}
    </>
  );
}
