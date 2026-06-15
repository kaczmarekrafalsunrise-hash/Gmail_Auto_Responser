'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppNav';
import { ConnectGmailHelp } from '@/components/ConnectGmailHelp';
import { MailboxCard } from '@/components/MailboxCard';
import { auth, gmail, getToken, GmailAccount } from '@/lib/api';

export default function MailboxesPage() {
  return (
    <Suspense fallback={<div className="container"><p>Loading…</p></div>}>
      <MailboxesContent />
    </Suspense>
  );
}

function MailboxesContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null);
  const [disconnectMessage, setDisconnectMessage] = useState('');
  const [disconnectError, setDisconnectError] = useState('');

  useEffect(() => {
    if (!getToken()) router.push('/login');
  }, [router]);

  const connectedEmail = searchParams.get('email');
  const connected = searchParams.get('connected');
  const error = searchParams.get('error');

  const { data: user } = useQuery({ queryKey: ['me'], queryFn: auth.me, retry: false });
  const { data: googleStatus } = useQuery({ queryKey: ['gmail-status'], queryFn: gmail.status });
  const { data: accountsData, refetch } = useQuery({
    queryKey: ['gmail-accounts'],
    queryFn: gmail.accounts,
    refetchInterval: 30_000,
  });

  const accounts = accountsData?.data ?? [];

  useEffect(() => {
    if (!getToken()) return;

    gmail
      .syncAll()
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] });
        queryClient.invalidateQueries({ queryKey: ['threads'] });
      })
      .catch(() => undefined);
  }, [queryClient]);

  useEffect(() => {
    if (!disconnectMessage) return;
    const id = window.setTimeout(() => setDisconnectMessage(''), 6_000);
    return () => window.clearTimeout(id);
  }, [disconnectMessage]);

  async function handleConnect() {
    setConnecting(true);
    setConnectError('');
    try {
      const res = await gmail.connect();
      window.location.href = res.url;
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to start Gmail connect');
      setConnecting(false);
    }
  }

  async function handleDisconnect(account: GmailAccount) {
    if (!confirm(`Disconnect ${account.gmail_email}? Synced messages stay in Threads until you delete data.`)) {
      return;
    }

    setDisconnectError('');
    setDisconnectMessage('');
    setDisconnectingId(account.id);

    queryClient.setQueryData<{ data: GmailAccount[]; meta?: { total: number } }>(
      ['gmail-accounts'],
      (current) => {
        if (!current) return current;
        const data = current.data.filter((a) => a.id !== account.id);
        return {
          ...current,
          data,
          meta: current.meta ? { ...current.meta, total: data.length } : current.meta,
        };
      },
    );

    try {
      await gmail.disconnect(account.id);
      setDisconnectMessage(`${account.gmail_email} disconnected.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['threads'] }),
        queryClient.invalidateQueries({ queryKey: ['threads', 'count'] }),
      ]);
    } catch (err) {
      await queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] });
      setDisconnectError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setDisconnectingId(null);
    }
  }

  async function handleSync(account: GmailAccount) {
    setSyncingId(account.id);
    try {
      await gmail.sync(account.id);
      setTimeout(() => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ['threads'] });
      }, 2_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <AppShell>
      <div className="container">
        <div className="page-heading">
          <div>
            <h1>Mailboxes</h1>
            {user && (
              <p>
                App account: <strong>{user.email}</strong> — only you can see mailboxes connected here.
              </p>
            )}
          </div>
        </div>

        {connected && (
          <p style={{ color: 'var(--success)', marginBottom: '1rem' }}>
            Connected{connectedEmail ? ` ${connectedEmail}` : ''} successfully.
          </p>
        )}
        {disconnectMessage && (
          <p style={{ color: 'var(--success)', marginBottom: '1rem' }} role="status">
            {disconnectMessage}
          </p>
        )}
        {error && <p className="error">Connection error: {error}</p>}
        {disconnectError && <p className="error">{disconnectError}</p>}
        {connectError && <p className="error">{connectError}</p>}

        {googleStatus && !googleStatus.oauth_configured && (
          <div className="card" style={{ borderColor: 'var(--warning)' }}>
            <h2>Platform not ready (developer setup)</h2>
            <p style={{ color: 'var(--muted)', marginBottom: '0.75rem' }}>
              Configure one Google OAuth app in <code>backend/.env</code> once. Users never enter Client ID/Secret.
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              <strong>Local dev only:</strong> add demo Google accounts under GCP → OAuth consent screen → Test users.
              <strong> Production:</strong> publish verified app — any user can connect without being listed.{' '}
              <Link href="/help">Help</Link>
            </p>
          </div>
        )}

        <ConnectGmailHelp oauthConfigured={!!googleStatus?.oauth_configured} />

        <div className="card">
          <div className="card-header-row">
            <div>
              <h2>Your connected Gmail accounts</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.35rem' }}>
                {accounts.length === 0
                  ? 'No mailboxes yet.'
                  : `${accounts.length} mailbox${accounts.length === 1 ? '' : 'es'} linked to your account`}
              </p>
            </div>
            <button
              onClick={handleConnect}
              className="btn btn-primary"
              disabled={connecting || !googleStatus?.oauth_configured}
            >
              {connecting ? 'Redirecting to Google…' : '+ Connect Gmail'}
            </button>
          </div>

          {accounts.length === 0 && googleStatus?.oauth_configured && (
            <div className="empty-state">
              <p>Connect your first Gmail to start classifying emails and generating drafts.</p>
            </div>
          )}

          {accounts.map((account) => (
            <MailboxCard
              key={account.id}
              account={account}
              onSync={handleSync}
              onDisconnect={handleDisconnect}
              syncing={syncingId === account.id}
              disconnecting={disconnectingId === account.id}
            />
          ))}
        </div>

        {googleStatus?.oauth_configured && !googleStatus.pubsub_configured && (
          <p style={{ color: 'var(--muted)', marginTop: '1rem', fontSize: '0.9rem' }}>
            Auto-sync runs every minute while this app is open. <strong>Sync now</strong> pulls immediately.
            Restart <code>run-backend.bat</code> to include the background scheduler.
          </p>
        )}
      </div>
    </AppShell>
  );
}
