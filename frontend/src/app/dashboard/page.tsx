'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, ConversationList, timeAgo } from '@/components/AppNav';
import { getToken, gmail, settings, threads, type Thread } from '@/lib/api';

function CenteredLoader({ message }: { message: string }) {
  return (
    <div className="page-loader page-loader--compact">
      <div className="page-loader__bar" aria-hidden="true">
        <div className="page-loader__bar-fill" />
      </div>
      <p className="page-loader__text">{message}</p>
    </div>
  );
}

function Sparkline({ color }: { color: string }) {
  return (
    <svg className="stat-sparkline" viewBox="0 0 80 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points="0,22 12,18 24,20 36,12 48,14 60,8 72,10 80,4"
      />
    </svg>
  );
}

function computeMetrics(items: Thread[]) {
  let autoReplied = 0;
  let needsReview = 0;

  for (const thread of items) {
    const msg = thread.messages?.[thread.messages.length - 1];
    if (!msg) continue;
    if (msg.draft_reply?.status === 'sent') autoReplied += 1;
    if (msg.draft_reply?.status === 'pending_approval') needsReview += 1;
  }

  return { autoReplied, needsReview };
}

function buildActivity(items: Thread[]) {
  const events: { text: string; time: string; tone: 'success' | 'info' | 'warning' }[] = [];

  for (const thread of items.slice(0, 8)) {
    const msg = thread.messages?.[thread.messages.length - 1];
    if (!msg) continue;
    const subject = thread.subject || 'Untitled thread';

    if (msg.draft_reply?.status === 'sent') {
      events.push({
        text: `Auto-replied to "${subject}"`,
        time: timeAgo(thread.last_message_at),
        tone: 'success',
      });
    } else if (msg.draft_reply?.status === 'pending_approval') {
      events.push({
        text: `Draft ready for review — "${subject}"`,
        time: timeAgo(thread.last_message_at),
        tone: 'warning',
      });
    } else if (msg.classification) {
      events.push({
        text: `Classified as ${msg.classification.label.replace('_', ' ')} — "${subject}"`,
        time: timeAgo(thread.last_message_at),
        tone: 'info',
      });
    }
  }

  return events.slice(0, 5);
}

function dateRangeLabel() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<CenteredLoader message="Loading dashboard..." />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const connected = searchParams.get('connected');
  const connectedEmail = searchParams.get('email');
  const tab = searchParams.get('tab');
  const [replyPrompt, setReplyPrompt] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getToken()) router.push('/login');
  }, [router]);

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['gmail-accounts'],
    queryFn: gmail.accounts,
  });
  const { data: threadsData, isLoading: threadsLoading } = useQuery({
    queryKey: ['threads', 'dashboard'],
    queryFn: () => threads.list({ page: 1 }),
    enabled: !accountsLoading,
  });
  const { data: googleStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['gmail-status'],
    queryFn: gmail.status,
  });
  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settings.get(),
    enabled: tab === 'settings',
  });

  useEffect(() => {
    if (settingsData?.reply_prompt) setReplyPrompt(settingsData.reply_prompt);
  }, [settingsData?.reply_prompt]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError('');
    setSaving(true);
    try {
      await settings.updateReplyPrompt(replyPrompt);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const accounts = accountsData?.data ?? [];
  const threadItems = threadsData?.data ?? [];
  const metrics = useMemo(() => computeMetrics(threadItems), [threadItems]);
  const activity = useMemo(() => buildActivity(threadItems), [threadItems]);
  const emailsProcessed =
    accounts.reduce((sum, a) => sum + (a.messages_count ?? 0), 0) || threadItems.length;

  const workflowDone = {
    received: threadItems.length > 0,
    classified: threadItems.some((t) => t.messages?.[t.messages.length - 1]?.classification),
    generated: threadItems.some((t) => t.messages?.[t.messages.length - 1]?.draft_reply),
    saved: threadItems.some((t) => {
      const d = t.messages?.[t.messages.length - 1]?.draft_reply;
      return d && d.status !== 'rejected';
    }),
    review: threadItems.some((t) => t.messages?.[t.messages.length - 1]?.draft_reply?.status === 'pending_approval'),
  };

  if (tab === 'settings') {
    return (
      <AppShell>
        <div className="container" style={{ maxWidth: 720 }}>
          <Link href="/dashboard" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            &larr; Back to overview
          </Link>
          <div className="page-heading" style={{ marginTop: '1rem' }}>
            <div>
              <h1>Reply prompt settings</h1>
              <p>Customize how the AI writes reply drafts for your incoming emails.</p>
            </div>
          </div>
          {settingsLoading ? (
            <CenteredLoader message="Loading settings..." />
          ) : (
            <form onSubmit={handleSaveSettings} className="card">
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                This prompt is sent to the LLM for every draft. Include tone, what to mention, and how to sign off.
                {settingsData?.llm_driver && (
                  <>
                    {' '}
                    Current model: <strong>{settingsData.llm_model}</strong> ({settingsData.llm_driver}).
                  </>
                )}
              </p>
              <textarea
                rows={12}
                value={replyPrompt}
                onChange={(e) => setReplyPrompt(e.target.value)}
                placeholder="Describe how replies should be written..."
                required
                minLength={20}
              />
              {settingsError && <p className="error">{settingsError}</p>}
              <button
                type="submit"
                className={`btn btn-primary${saving ? ' btn--loading' : ''}`}
                style={{ marginTop: '1rem' }}
                disabled={saving}
              >
                {saving && <span className="btn-spinner" aria-hidden="true" />}
                {saving ? 'Saving...' : 'Save prompt'}
              </button>
            </form>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container">
        <div className="page-heading">
          <div>
            <h1>Overview</h1>
            <p>Monitor your AI-powered Gmail automation at a glance.</p>
          </div>
          <button type="button" className="date-range-btn">
            {dateRangeLabel()}
          </button>
        </div>

        {connected && (
          <p style={{ color: 'var(--success)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Gmail connected{connectedEmail ? `: ${connectedEmail}` : ''}.{' '}
            <Link href="/dashboard/mailboxes">Manage mailboxes</Link>
          </p>
        )}

        <div className="overview-stats">
          <div className="stat-card">
            <p className="stat-card-label">Total Accounts</p>
            <p className="stat-card-value">{accountsLoading ? '—' : accounts.length}</p>
            <p className="stat-card-meta">Connected Gmail inboxes</p>
          </div>
          <div className="stat-card">
            <p className="stat-card-label">Emails Processed</p>
            <p className="stat-card-value">{threadsLoading ? '—' : emailsProcessed.toLocaleString()}</p>
            <p className="stat-card-trend stat-card-trend--up">+12.5% vs last month</p>
            <Sparkline color="#12b76a" />
          </div>
          <div className="stat-card">
            <p className="stat-card-label">Auto-Replied</p>
            <p className="stat-card-value">{threadsLoading ? '—' : metrics.autoReplied}</p>
            <p className="stat-card-meta">Sent via Gmail</p>
            <Sparkline color="#33d6de" />
          </div>
          <div className="stat-card">
            <p className="stat-card-label">Needs Review</p>
            <p className="stat-card-value">{threadsLoading ? '—' : metrics.needsReview}</p>
            <p className="stat-card-meta">Pending approval</p>
            <Sparkline color="#f79009" />
          </div>
          <div className="stat-card">
            <p className="stat-card-label">Response Time</p>
            <p className="stat-card-value">2m 15s</p>
            <p className="stat-card-meta">Avg. draft generation</p>
          </div>
        </div>

        <div className="overview-grid">
          <div className="panel">
            <div className="panel-head">
              <h2>Connected Gmail Accounts</h2>
              <Link href="/dashboard/mailboxes" className="panel-link">
                Manage
              </Link>
            </div>
            {accountsLoading ? (
              <CenteredLoader message="Loading accounts..." />
            ) : accounts.length === 0 ? (
              <p className="empty-inline">No mailboxes connected yet.</p>
            ) : (
              accounts.map((account) => (
                <div key={account.id} className="account-row">
                  <div>
                    <p className="account-email">{account.gmail_email}</p>
                    <p className="account-meta">
                      {account.messages_count ?? 0} emails processed
                    </p>
                  </div>
                  <span className={`badge badge-${account.status === 'active' ? 'active' : 'warning'}`}>
                    {account.status_label || account.status}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Recent Conversations</h2>
              <Link href="/threads" className="panel-link">
                View all
              </Link>
            </div>
            <Suspense fallback={<CenteredLoader message="Loading..." />}>
              <ConversationList
                threads={threadItems}
                mailboxes={accounts}
                loading={threadsLoading}
                limit={5}
                showFilters={false}
                showFooter
                compact
              />
            </Suspense>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Automation Workflow</h2>
            </div>
            <div className="workflow-steps">
              {[
                { key: 'received', title: 'Email Received', done: workflowDone.received },
                { key: 'classified', title: 'Classified by AI', done: workflowDone.classified },
                { key: 'generated', title: 'Draft Generated', done: workflowDone.generated },
                { key: 'saved', title: 'Draft Saved', done: workflowDone.saved },
                { key: 'review', title: 'Review & Send', done: workflowDone.review },
              ].map((step) => (
                <div key={step.key} className={`workflow-step${step.done ? ' done' : ''}`}>
                  <div className="workflow-dot">{step.done ? '✓' : ''}</div>
                  <div>
                    <p className="workflow-step-title">{step.title}</p>
                    <p className="workflow-step-time">
                      {step.done ? 'Completed' : 'Waiting for activity'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: '1rem' }}>
          <div className="panel-head">
            <h2>Activity Feed</h2>
          </div>
          {activity.length === 0 ? (
            <p className="empty-inline">Activity will appear once emails are processed.</p>
          ) : (
            <div className="activity-list">
              {activity.map((item, i) => (
                <div key={i} className="activity-item">
                  <span className={`activity-dot activity-dot--${item.tone}`} />
                  <div>
                    <p className="activity-text">{item.text}</p>
                    <p className="activity-time">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!statusLoading && !googleStatus?.oauth_configured && (
          <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--warning)' }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Developer: enable Gmail connect</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in{' '}
              <code>backend/.env</code>. See <Link href="/help">Help</Link>.
            </p>
          </div>
        )}

        {!accountsLoading && accounts.length === 0 && googleStatus?.oauth_configured && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Get started</h2>
            <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
              Connect at least one Gmail mailbox to run the auto-responder workflow.
            </p>
            <Link href="/dashboard/mailboxes" className="btn btn-primary">
              Connect your first Gmail
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
