'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth, clearToken, getToken, threads } from '@/lib/api';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  match: (path: string, tab: string | null) => boolean;
};

function SidebarNav({ threadCount, draftCount }: { threadCount: number; draftCount: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const status = searchParams.get('status');

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
      match: (path) => path.startsWith('/threads') && status !== 'pending',
    },
    {
      href: '/threads?status=pending',
      label: 'Drafts',
      icon: 'edit',
      badge: draftCount,
      match: (path) => path.startsWith('/threads') && status === 'pending',
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
        <button type="button" className="header-icon-btn" aria-label="Toggle theme">
          <span className="header-icon header-icon--sun" />
        </button>
        <button type="button" className="header-icon-btn header-icon-btn--badge" aria-label="Notifications">
          <span className="header-icon header-icon--bell" />
          <span className="header-badge">3</span>
        </button>
        <HeaderUser />
      </div>
    </header>
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
    queryKey: ['threads'],
    queryFn: () => threads.list(),
    enabled: !!getToken(),
  });

  const threadCount = threadsData?.data?.length ?? 0;
  const draftCount =
    threadsData?.data?.filter((thread) => {
      const msg = thread.messages?.[thread.messages.length - 1];
      return msg?.draft_reply?.status === 'pending_approval';
    }).length ?? 0;

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
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon" aria-hidden="true">
            AR
          </span>
          <div>
            <strong>AutoResponder</strong>
            <span>AI Gmail Assistant</span>
          </div>
        </div>

        <Link href="/dashboard/mailboxes" className="btn btn-primary sidebar-connect">
          + Connect Gmail
        </Link>

        <Suspense fallback={null}>
          <SidebarNav threadCount={threadCount} draftCount={draftCount} />
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
