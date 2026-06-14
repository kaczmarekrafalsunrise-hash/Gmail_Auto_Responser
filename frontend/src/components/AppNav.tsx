'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth, clearToken, getToken, notifications, threads, type Thread } from '@/lib/api';

function BrandBolt() {
  return (
    <svg viewBox="0 0 24 32" fill="currentColor" aria-hidden="true">
      <path d="M14 0L4 18h7l-2 14 14-22h-8l1-10z" />
    </svg>
  );
}

function BrandMark() {
  return (
    <div className="revreply-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M14 0L4 18h7l-2 14 14-22h-8l1-10z" fill="#0a0a0a" />
      </svg>
    </div>
  );
}

export function RevReplyBrand({ center, tagline = 'AI Gmail Assistant' }: { center?: boolean; tagline?: string }) {
  return (
    <div className={`revreply-brand${center ? ' revreply-brand--center' : ''}`}>
      <BrandMark />
      <div>
        <span className="revreply-wordmark">
          Re<span className="revreply-bolt"><BrandBolt /></span>Reply
        </span>
        {tagline && <span className="revreply-tagline">{tagline}</span>}
      </div>
    </div>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  match: (path: string, tab: string | null) => boolean;
};

function SidebarNav({ threadCount }: { threadCount: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');

  const mainNav: NavItem[] = [
    {
      href: '/dashboard',
      label: 'Overview',
      icon: 'grid',
      match: (path, t) => path === '/dashboard' && t !== 'settings',
    },
    {
      href: '/threads',
      label: 'Conversations',
      icon: 'mail',
      badge: threadCount,
      match: (path) => path.startsWith('/threads'),
    },
  ];

  const manageNav: NavItem[] = [
    {
      href: '/dashboard/mailboxes',
      label: 'Mailboxes',
      icon: 'inbox',
      match: (path) => path.startsWith('/dashboard/mailboxes'),
    },
    {
      href: '/dashboard?tab=settings',
      label: 'Settings',
      icon: 'settings',
      match: (path, t) => path === '/dashboard' && t === 'settings',
    },
    {
      href: '/help',
      label: 'Help',
      icon: 'help',
      match: (path) => path === '/help',
    },
  ];

  function renderLink(item: NavItem) {
    const active = item.match(pathname, tab);
    return (
      <Link key={item.href} href={item.href} className={`sidebar-link${active ? ' active' : ''}`}>
        <span className={`sidebar-link-icon sidebar-link-icon--${item.icon}`} aria-hidden="true" />
        <span className="sidebar-link-label">{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="sidebar-badge">{item.badge}</span>
        )}
      </Link>
    );
  }

  return (
    <nav className="sidebar-nav">
      <p className="sidebar-section-label">Main</p>
      {mainNav.map(renderLink)}
      <p className="sidebar-section-label">Manage</p>
      {manageNav.map(renderLink)}
    </nav>
  );
}

function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
  }, [searchParams]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function applySearch(value: string) {
    const trimmed = value.trim();
    if (pathname.startsWith('/threads')) {
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set('q', trimmed);
      else params.delete('q');
      params.delete('page');
      router.push(`/threads?${params.toString()}`);
      return;
    }
    router.push(trimmed ? `/threads?q=${encodeURIComponent(trimmed)}` : '/threads');
  }

  return (
    <header className="app-header">
      <div className="search-bar">
        <span className="search-bar-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applySearch(query);
          }}
          placeholder="Search threads, contacts, accounts..."
          aria-label="Search threads, contacts, accounts"
        />
        <kbd className="search-kbd">Ctrl K</kbd>
      </div>
      <div className="header-actions">
        <HeaderNotifications />
        <HeaderUser />
      </div>
    </header>
  );
}

function HeaderNotifications() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: notifications.list,
    enabled: !!getToken(),
    refetchInterval: 30_000,
  });

  const items = data?.data ?? [];
  const unreadCount = items.length;

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  async function markAllRead() {
    try {
      await notifications.markAllRead();
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      /* ignore */
    }
  }

  async function openThread(threadId: number) {
    try {
      await threads.markSeen(threadId);
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      /* ignore */
    }
    setOpen(false);
    router.push(`/threads/${threadId}`);
  }

  return (
    <div className="notification-wrap" ref={panelRef}>
      <button
        type="button"
        className="header-icon-btn header-icon-btn--badge"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="header-icon header-icon--bell" />
        {unreadCount > 0 && (
          <span className="header-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel-head">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" className="notification-mark-all" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="notification-loading">
              <div className="notification-loading-bar" aria-hidden="true">
                <div className="notification-loading-bar-fill" />
              </div>
            </div>
          ) : items.length === 0 ? (
            <p className="notification-empty">No unread notifications.</p>
          ) : (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="notification-item notification-item--unread"
                    onClick={() => openThread(item.thread_id)}
                  >
                    <span
                      className={`notification-dot notification-dot--${item.type === 'needs_review' ? 'warning' : 'success'}`}
                    />
                    <span className="notification-item-body">
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                      <time>{timeAgo(item.created_at)}</time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="notification-panel-foot">
            <Link href="/threads?filter=needs_review" className="notification-view-all" onClick={() => setOpen(false)}>
              View needs review
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderUser() {
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: auth.me,
    retry: false,
    enabled: !!getToken(),
  });

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  return (
    <div className="header-user">
      <div className="header-avatar">{initials}</div>
      <div className="header-user-info">
        <strong>{user?.name ?? 'User'}</strong>
        <span>{user?.email ?? ''}</span>
      </div>
    </div>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const { data: threadsData } = useQuery({
    queryKey: ['threads', 'sidebar-count'],
    queryFn: () => threads.list({ page: 1 }),
    enabled: !!getToken(),
  });

  const threadCount = threadsData?.total ?? 0;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await auth.logout();
    } finally {
      clearToken();
      router.push('/login');
      setLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="sidebar-brand">
          <RevReplyBrand tagline="AI Gmail Assistant" />
        </Link>

        <Link href="/dashboard/mailboxes" className="btn btn-primary sidebar-connect">
          + Connect Gmail
        </Link>

        <Suspense fallback={null}>
          <SidebarNav threadCount={threadCount} />
        </Suspense>

        <div className="sidebar-footer">
          <div className="usage-widget">
            <div className="usage-widget-head">
              <span>Usage this month</span>
              <span>24.8%</span>
            </div>
            <div className="usage-bar">
              <div className="usage-bar-fill" style={{ width: '24.8%' }} />
            </div>
            <p className="usage-meta">12,430 / 50,000 emails</p>
            <button type="button" className="btn btn-ghost btn-sm usage-upgrade">
              Upgrade Plan
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost sidebar-logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </aside>

      <div className="app-main">
        <Suspense fallback={null}>
          <AppHeader />
        </Suspense>
        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}

/** @deprecated Use AppShell instead */
export function AppNav({ children }: { children?: React.ReactNode }) {
  if (children) return <AppShell>{children}</AppShell>;
  return null;
}

export const WORKFLOW_TABS = [
  { id: 'all', label: 'All' },
  { id: 'needs_review', label: 'Needs Review', dot: 'warning' },
  { id: 'sent', label: 'Sent', dot: 'success' },
] as const;

function buildThreadsHref(
  searchParams: URLSearchParams,
  updates: { filter?: string; page?: number; mailbox?: string; mailbox_q?: string | null },
) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete('label');

  if (updates.filter !== undefined) {
    if (updates.filter === 'all') params.delete('filter');
    else params.set('filter', updates.filter);
  }

  if (updates.mailbox !== undefined) {
    if (updates.mailbox === 'all') params.delete('mailbox');
    else params.set('mailbox', updates.mailbox);
  }

  if (updates.mailbox_q !== undefined) {
    if (!updates.mailbox_q?.trim()) params.delete('mailbox_q');
    else params.set('mailbox_q', updates.mailbox_q.trim());
  }

  if (updates.page !== undefined) {
    if (updates.page <= 1) params.delete('page');
    else params.set('page', String(updates.page));
  } else if (
    updates.filter !== undefined ||
    updates.mailbox !== undefined ||
    updates.mailbox_q !== undefined
  ) {
    params.delete('page');
  }

  const qs = params.toString();
  return qs ? `/threads?${qs}` : '/threads';
}

function MailboxFilterBar({
  mailboxes,
  mailboxFilter,
  mailboxQ,
}: {
  mailboxes: { id: number; gmail_email: string }[];
  mailboxFilter: string;
  mailboxQ: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inboxSearch, setInboxSearch] = useState(mailboxQ);

  useEffect(() => {
    setInboxSearch(mailboxQ);
  }, [mailboxQ]);

  function onMailboxSelect(value: string) {
    router.push(
      buildThreadsHref(searchParams, {
        mailbox: value,
        mailbox_q: null,
      }),
    );
    setInboxSearch('');
  }

  function applyInboxSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(
      buildThreadsHref(searchParams, {
        mailbox: 'all',
        mailbox_q: inboxSearch.trim() || null,
      }),
    );
  }

  function clearInboxSearch() {
    setInboxSearch('');
    router.push(buildThreadsHref(searchParams, { mailbox_q: null }));
  }

  return (
    <div className="mailbox-toolbar">
      <div className="mailbox-toolbar-inbox">
        <span className="mailbox-toolbar-select-icon" aria-hidden="true" />
        <select
          id="mailbox-select"
          className="mailbox-toolbar-select"
          value={mailboxFilter === 'all' ? 'all' : mailboxFilter}
          onChange={(e) => onMailboxSelect(e.target.value)}
          title={
            mailboxFilter === 'all'
              ? 'All connected mailboxes'
              : mailboxes.find((m) => String(m.id) === mailboxFilter)?.gmail_email
          }
        >
          <option value="all">All mailboxes ({mailboxes.length})</option>
          {mailboxes.map((account) => (
            <option key={account.id} value={String(account.id)} title={account.gmail_email}>
              {mailboxLabel(account.gmail_email, 28)}
            </option>
          ))}
        </select>
      </div>

      <form className="mailbox-toolbar-search" onSubmit={applyInboxSearch}>
        <span className="mailbox-toolbar-search-icon" aria-hidden="true" />
        <input
          id="mailbox-search"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          className="mailbox-toolbar-search-input"
          placeholder="Filter by Gmail address"
          value={inboxSearch}
          onChange={(e) => setInboxSearch(e.target.value)}
          autoComplete="off"
          aria-label="Filter by Gmail address"
        />
        {inboxSearch ? (
          <button
            type="button"
            className="mailbox-toolbar-search-clear"
            aria-label="Clear search"
            onClick={clearInboxSearch}
          >
            ×
          </button>
        ) : null}
        <button type="submit" className="mailbox-toolbar-search-submit" aria-label="Search">
          <span className="mailbox-toolbar-search-submit-icon" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

function ConversationNotificationToggle({
  threadId,
  state,
}: {
  threadId: number;
  state: 0 | 1 | undefined;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const isUnread = state !== 1;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next: 0 | 1 = isUnread ? 1 : 0;
    setBusy(true);
    try {
      await threads.setNotificationState(threadId, next);
      await queryClient.invalidateQueries({ queryKey: ['threads'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      await queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`conversation-state-btn${isUnread ? ' is-unread' : ' is-read'}`}
      aria-label={isUnread ? 'Mark as read (check)' : 'Mark as unread (uncheck)'}
      aria-pressed={!isUnread}
      disabled={busy}
      onClick={toggle}
    >
      {isUnread ? (
        <svg className="conversation-state-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
          <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="conversation-state-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M7.5 12.2l2.8 2.8 6.2-6.4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
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
  if (!email) return '#33d6de';
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const hues = ['#33d6de', '#2bc4cc', '#0891b2', '#2563eb', '#059669', '#0ea5e9'];
  return hues[Math.abs(hash) % hues.length];
}

function draftStatusLabel(draft?: { status: string }) {
  if (!draft) return null;
  if (draft.status === 'sent') return { text: 'Auto-Responded', tone: 'success' };
  if (draft.status === 'pending_approval') return { text: 'Needs Review', tone: 'warning' };
  if (draft.status === 'approved') return { text: 'Draft Ready', tone: 'info' };
  return { text: draft.status.replace('_', ' '), tone: 'muted' };
}

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

export function mailboxLabel(email?: string, maxLen = 32) {
  if (!email) return 'Unknown mailbox';
  if (email.length <= maxLen) return email;
  const [local, domain] = email.split('@');
  if (!domain) return `${email.slice(0, maxLen - 1)}…`;
  const domainBudget = Math.min(domain.length, 12);
  const localBudget = maxLen - domainBudget - 4;
  if (localBudget < 4) return `${email.slice(0, maxLen - 1)}…`;
  return `${local.slice(0, localBudget)}…@${domain.slice(0, domainBudget)}${domain.length > domainBudget ? '…' : ''}`;
}

function filterThreads(items: Thread[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((thread) => {
    const latest = thread.messages?.[thread.messages.length - 1];
    const haystack = `${thread.subject ?? ''} ${thread.snippet ?? ''} ${latest?.from_email ?? ''} ${thread.gmail_account?.gmail_email ?? ''}`.toLowerCase();
    return haystack.includes(q);
  });
}

type ConversationListProps = {
  threads: Thread[];
  mailboxes?: { id: number; gmail_email: string }[];
  loading?: boolean;
  fetching?: boolean;
  limit?: number;
  showFilters?: boolean;
  showFooter?: boolean;
  compact?: boolean;
  pagination?: {
    currentPage: number;
    lastPage: number;
    total: number;
  };
};

export function ConversationList({
  threads: threadItems,
  mailboxes = [],
  loading,
  fetching,
  limit,
  showFilters = true,
  showFooter = false,
  compact = false,
  pagination,
}: ConversationListProps) {
  const searchParams = useSearchParams();
  const workflowFilter = searchParams.get('filter') ?? 'all';
  const mailboxFilter = searchParams.get('mailbox') ?? 'all';
  const mailboxQ = searchParams.get('mailbox_q') ?? '';
  const query = searchParams.get('q') ?? '';
  const currentPage = pagination?.currentPage ?? Number(searchParams.get('page') ?? '1');
  const showMailboxFilters = showFilters && mailboxes.length > 0;

  const visible = limit
    ? filterThreads(threadItems, query).slice(0, limit)
    : threadItems;

  const isInitialLoad = !!loading && visible.length === 0;
  const showLoadingBar = !!fetching || isInitialLoad;

  return (
    <>
      {showFilters && (
        <>
          <div className="filter-tabs filter-tabs--single">
            <div className="filter-tabs-row">
              {WORKFLOW_TABS.map((tab) => (
                <Link
                  key={tab.id}
                  href={buildThreadsHref(searchParams, { filter: tab.id })}
                  className={`filter-tab${workflowFilter === tab.id ? ' active' : ''}`}
                >
                  {'dot' in tab && tab.dot && (
                    <span className={`filter-dot filter-dot--${tab.dot}`} />
                  )}
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>

          {showMailboxFilters && (
            <MailboxFilterBar
              mailboxes={mailboxes}
              mailboxFilter={mailboxFilter}
              mailboxQ={mailboxQ}
            />
          )}
        </>
      )}

      <div
        className={`conversation-panel-body${compact ? ' conversation-panel-body--compact' : ''}${showLoadingBar ? ' is-fetching' : ''}`}
      >
        {showLoadingBar && (
          <div className="conversation-loading-bar" aria-hidden="true">
            <div className="conversation-loading-bar-fill" />
          </div>
        )}

        {pagination && !isInitialLoad && (
          <p className="conversation-count">
            {pagination.total.toLocaleString()} conversation{pagination.total === 1 ? '' : 's'}
            {(workflowFilter !== 'all' || mailboxFilter !== 'all' || mailboxQ || query) &&
              ' matching filters'}
          </p>
        )}

        <div className={`conversation-list${compact ? ' conversation-list--compact' : ''}`}>
          {visible.map((thread) => {
          const latest = thread.messages?.[thread.messages.length - 1];
          const classification = latest?.classification;
          const draft = latest?.draft_reply;
          const status = draftStatusLabel(draft);
          const email = latest?.from_email;
          const mailboxEmail = thread.gmail_account?.gmail_email;
          const initials = senderName(email)
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          return (
            <div
              key={thread.id}
              className={`conversation-item${thread.notification_state !== 1 ? ' conversation-item--unread' : ''}`}
            >
              <Link href={`/threads/${thread.id}`} className="conversation-row">
                <div className="conversation-avatar" style={{ background: avatarColor(email) }}>
                  {initials}
                </div>
                <div className="conversation-body">
                  <div className="conversation-top">
                    <strong>{senderName(email)}</strong>
                    <span className="conversation-time">{timeAgo(thread.last_message_at)}</span>
                  </div>
                  {mailboxEmail && (
                    <div className="conversation-mailbox" title={`Received in ${mailboxEmail}`}>
                      <span
                        className="mailbox-pill mailbox-pill--inline"
                        style={{ '--mailbox-color': avatarColor(mailboxEmail) } as CSSProperties}
                      >
                        <span className="mailbox-pill-dot" aria-hidden="true" />
                        {mailboxLabel(mailboxEmail, 30)}
                      </span>
                    </div>
                  )}
                  <p className="conversation-subject">{thread.subject || '(no subject)'}</p>
                  <p className="conversation-snippet">{thread.snippet}</p>
                  <div className="conversation-tags">
                    {classification && (
                      <span className={`badge badge-${classification.label}`}>
                        {classification.label.replace('_', ' ')}
                      </span>
                    )}
                    {!classification && !draft && (
                      <span className="badge badge-unclear">Processing</span>
                    )}
                  </div>
                </div>
                <div className="conversation-status">
                  {status && (
                    <span className={`status-pill status-pill--${status.tone}`}>{status.text}</span>
                  )}
                  <span className="conversation-chevron" aria-hidden="true" />
                </div>
              </Link>
              {!compact && (
                <div className="conversation-state-slot">
                  <ConversationNotificationToggle
                    threadId={thread.id}
                    state={thread.notification_state}
                  />
                </div>
              )}
            </div>
          );
        })}
        </div>

        {!visible.length && !isInitialLoad && (
          <p className="empty-inline">
            {query || workflowFilter !== 'all' || mailboxFilter !== 'all' || mailboxQ
              ? 'No conversations match your filters.'
              : 'No threads yet. Connect Gmail and send a test email.'}
          </p>
        )}

        {pagination && (
          <nav className="pagination" aria-label="Conversations pagination">
            <Link
              href={buildThreadsHref(searchParams, { page: currentPage - 1 })}
              className={`btn btn-secondary btn-sm${currentPage <= 1 ? ' pagination-btn--disabled' : ''}`}
              aria-disabled={currentPage <= 1}
              onClick={(e) => currentPage <= 1 && e.preventDefault()}
            >
              Previous
            </Link>
            <span className="pagination-meta">
              Page {pagination.currentPage} of {pagination.lastPage}
            </span>
            <Link
              href={buildThreadsHref(searchParams, { page: currentPage + 1 })}
              className={`btn btn-secondary btn-sm${currentPage >= pagination.lastPage ? ' pagination-btn--disabled' : ''}`}
              aria-disabled={currentPage >= pagination.lastPage}
              onClick={(e) => currentPage >= pagination.lastPage && e.preventDefault()}
            >
              Next
            </Link>
          </nav>
        )}
      </div>

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
