'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, avatarColor, mailboxLabel, senderName, timeAgo } from '@/components/AppNav';
import { drafts, getToken, threads } from '@/lib/api';

function parseSender(fromEmail?: string) {
  if (!fromEmail) return { name: 'Unknown sender', email: '' };
  const match = fromEmail.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: senderName(fromEmail), email: fromEmail };
}

function formatLabel(label?: string) {
  if (!label) return '';
  return label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function draftStatusInfo(status?: string) {
  if (!status) return null;
  if (status === 'sent') return { text: 'Reply sent', tone: 'success' as const };
  if (status === 'pending_approval') return { text: 'Needs review', tone: 'warning' as const };
  if (status === 'approved') return { text: 'Ready to send', tone: 'info' as const };
  return { text: formatLabel(status), tone: 'muted' as const };
}

function workflowSteps(
  hasMessage: boolean,
  classification?: { label: string },
  draft?: { status: string },
  waitingForDraft?: boolean,
) {
  const classified = !!classification;
  const draftReady = !!draft;
  const sent = draft?.status === 'sent';
  const skipped = classification?.label === 'not_interested';

  return [
    { key: 'received', label: 'Received', done: hasMessage },
    {
      key: 'classified',
      label: classified ? formatLabel(classification.label) : 'Classifying',
      done: classified,
      active: hasMessage && !classified,
    },
    {
      key: 'draft',
      label: skipped ? 'No reply needed' : draftReady ? 'Draft ready' : 'Generating draft',
      done: draftReady || skipped,
      active: classified && !draftReady && !skipped && waitingForDraft,
      skipped,
    },
    {
      key: 'sent',
      label: 'Sent via Gmail',
      done: sent,
      active: draft?.status === 'pending_approval' || draft?.status === 'approved',
    },
  ];
}

export default function ThreadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const threadId = Number(params.id);
  const queryClient = useQueryClient();
  const [draftBody, setDraftBody] = useState('');
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    if (!getToken()) router.push('/login');
  }, [router]);

  const latestMessage = (data: Awaited<ReturnType<typeof threads.show>> | undefined) =>
    data?.messages?.[data.messages.length - 1];

  const needsProcessing = (data: Awaited<ReturnType<typeof threads.show>> | undefined) => {
    const msg = latestMessage(data);
    if (!msg) return false;
    if (msg.classification?.label === 'not_interested') return false;
    return !msg.draft_reply;
  };

  const { data: thread, isLoading, isFetching } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => threads.show(threadId),
    enabled: !!threadId,
    refetchInterval: (query) => (needsProcessing(query.state.data) ? 4_000 : false),
  });

  const message = thread?.messages?.[thread.messages.length - 1];
  const draft = message?.draft_reply;
  const classification = message?.classification;
  const waitingForDraft =
    !!message && !draft && classification?.label !== 'not_interested' && !!classification;

  useEffect(() => {
    if (draft?.body) setDraftBody(draft.body);
  }, [draft?.body]);

  useEffect(() => {
    if (!thread?.id || thread.notification_state === 1) return;
    threads.markSeen(thread.id).then(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    });
  }, [thread?.id, thread?.notification_state, threadId, queryClient]);

  async function handleApprove() {
    if (!draft) return;
    setActionError('');
    setActing('approve');
    try {
      await drafts.approve(draft.id, draftBody);
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setActing(null);
    }
  }

  async function handleReject() {
    if (!draft) return;
    setActionError('');
    setActing('reject');
    try {
      await drafts.reject(draft.id);
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setActing(null);
    }
  }

  const sender = parseSender(message?.from_email);
  const emailForAvatar = sender.email || message?.from_email;
  const receivingMailbox = thread?.gmail_account?.gmail_email;
  const initials = sender.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  const draftInfo = draftStatusInfo(draft?.status);
  const steps = workflowSteps(!!message, classification, draft, waitingForDraft);

  return (
    <AppShell>
      <div className="container thread-detail">
        <Link href="/threads" className="thread-back-link">
          <span className="thread-back-icon" aria-hidden="true" />
          Back to conversations
        </Link>

        {isLoading && !thread ? (
          <div className="thread-detail-shell">
            <div className="conversation-loading-bar" aria-hidden="true">
              <div className="conversation-loading-bar-fill" />
            </div>
            <div className="thread-detail-skeleton">
              <div className="thread-skeleton-line thread-skeleton-line--title" />
              <div className="thread-skeleton-line thread-skeleton-line--short" />
              <div className="thread-detail-grid">
                <div className="thread-skeleton-panel" />
                <div className="thread-skeleton-panel" />
              </div>
            </div>
          </div>
        ) : !thread ? (
          <div className="thread-empty-state panel">
            <h2>Conversation not found</h2>
            <p>This thread may have been removed or you don&apos;t have access.</p>
            <Link href="/threads" className="btn btn-primary">
              Return to conversations
            </Link>
          </div>
        ) : (
          <>
            <header className="thread-detail-header">
              <div>
                <h1>{thread.subject || '(no subject)'}</h1>
                <p className="thread-detail-meta">
                  {message?.received_at && (
                    <>
                      Received {timeAgo(message.received_at)}
                      <span className="thread-detail-meta-sep">·</span>
                      {new Date(message.received_at).toLocaleString()}
                    </>
                  )}
                </p>
              </div>
              <div className="thread-detail-badges">
                {classification && (
                  <span className={`badge badge-${classification.label}`}>
                    {formatLabel(classification.label)}
                    <span className="thread-badge-confidence">
                      {Math.round(classification.confidence * 100)}%
                    </span>
                  </span>
                )}
                {draftInfo && (
                  <span className={`badge badge-${draft?.status ?? 'unclear'}`}>{draftInfo.text}</span>
                )}
                {waitingForDraft && (
                  <span className="badge badge-pending_approval">Processing</span>
                )}
                {receivingMailbox && (
                  <span
                    className="mailbox-pill mailbox-pill--header"
                    style={{ '--mailbox-color': avatarColor(receivingMailbox) } as CSSProperties}
                    title={`Received in ${receivingMailbox}`}
                  >
                    <span className="mailbox-pill-dot" aria-hidden="true" />
                    {mailboxLabel(receivingMailbox, 36)}
                  </span>
                )}
              </div>
            </header>

            <div className={`thread-detail-shell${isFetching ? ' is-fetching' : ''}`}>
              {isFetching && (
                <div className="conversation-loading-bar" aria-hidden="true">
                  <div className="conversation-loading-bar-fill" />
                </div>
              )}

              <div className="thread-workflow" aria-label="Automation progress">
                {steps.map((step, index) => (
                  <div
                    key={step.key}
                    className={`thread-workflow-step${
                      step.done ? ' is-done' : step.active ? ' is-active' : ''
                    }${step.skipped ? ' is-skipped' : ''}`}
                  >
                    <span className="thread-workflow-dot" />
                    <span className="thread-workflow-label">{step.label}</span>
                    {index < steps.length - 1 && <span className="thread-workflow-line" aria-hidden="true" />}
                  </div>
                ))}
              </div>

              {message && (
                <div className="thread-detail-grid">
                  <section className="thread-message-panel panel">
                    <div className="thread-message-head">
                      <div
                        className="conversation-avatar thread-message-avatar"
                        style={{ background: avatarColor(emailForAvatar) }}
                      >
                        {initials || '?'}
                      </div>
                      <div className="thread-message-head-text">
                        <div className="thread-message-top">
                          <strong>{sender.name}</strong>
                          <time dateTime={message.received_at}>
                            {new Date(message.received_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </time>
                        </div>
                        {sender.email && (
                          <span className="thread-message-email">{sender.email}</span>
                        )}
                        {receivingMailbox && (
                          <span className="thread-message-inbox" title={receivingMailbox}>
                            Received in{' '}
                            <strong>{mailboxLabel(receivingMailbox, 40)}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="thread-message-body">
                      {message.body_text?.split('\n').map((line, i) => (
                        <p key={i}>{line || '\u00A0'}</p>
                      ))}
                    </div>
                  </section>

                  <section className="thread-draft-panel panel">
                    <div className="panel-head thread-draft-head">
                      <div>
                        <h2>AI draft reply</h2>
                        <p className="panel-subtext">
                          Review, edit, then approve to send through Gmail.
                        </p>
                      </div>
                      {draft && (
                        <span className={`badge badge-${draft.status}`}>
                          {formatLabel(draft.status)}
                        </span>
                      )}
                    </div>

                    {draft ? (
                      <div className="thread-draft-content">
                        {actionError && <p className="error">{actionError}</p>}
                        <textarea
                          className="thread-draft-textarea"
                          rows={10}
                          value={draftBody}
                          onChange={(e) => setDraftBody(e.target.value)}
                          disabled={draft.status !== 'pending_approval' || acting !== null}
                          placeholder="Draft reply will appear here..."
                        />
                        {draft.status === 'pending_approval' && (
                          <div className="thread-draft-actions">
                            <button
                              type="button"
                              onClick={handleApprove}
                              className="btn btn-primary"
                              disabled={acting !== null || !draftBody.trim()}
                            >
                              {acting === 'approve' ? 'Sending…' : 'Approve & send'}
                            </button>
                            <button
                              type="button"
                              onClick={handleReject}
                              className="btn btn-danger"
                              disabled={acting !== null}
                            >
                              {acting === 'reject' ? 'Rejecting…' : 'Reject draft'}
                            </button>
                          </div>
                        )}
                        {draft.status === 'sent' && (
                          <div className="thread-draft-success">
                            <span className="thread-draft-success-icon" aria-hidden="true" />
                            Reply sent successfully via Gmail.
                          </div>
                        )}
                        {draft.status === 'approved' && (
                          <p className="thread-draft-note">Draft approved — sending shortly.</p>
                        )}
                      </div>
                    ) : waitingForDraft ? (
                      <div className="thread-draft-waiting">
                        <div className="thread-draft-waiting-bar" aria-hidden="true">
                          <div className="conversation-loading-bar-fill" />
                        </div>
                        <p>Analyzing the message and generating a reply…</p>
                        <span className="thread-draft-waiting-hint">Usually takes a few seconds</span>
                      </div>
                    ) : classification?.label === 'not_interested' ? (
                      <div className="thread-draft-empty">
                        <span className="thread-draft-empty-icon" aria-hidden="true" />
                        <p>No reply generated</p>
                        <span className="thread-draft-waiting-hint">
                          Classified as not interested — automation skipped.
                        </span>
                      </div>
                    ) : (
                      <div className="thread-draft-empty">
                        <p>Waiting for classification…</p>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
