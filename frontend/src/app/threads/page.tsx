'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AppShell, ConversationList } from '@/components/AppNav';
import { getToken, gmail, threads } from '@/lib/api';

function threadNeedsProcessing(thread: Awaited<ReturnType<typeof threads.list>>['data'][number]) {
  const latestMessage = thread.messages?.[thread.messages.length - 1];
  if (!latestMessage) return false;
  if (!latestMessage.classification) return true;
  if (latestMessage.classification.label === 'not_interested') return false;
  return !latestMessage.draft_reply;
}

function ThreadsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const filter = (searchParams.get('filter') ?? 'all') as 'all' | 'needs_review' | 'sent';
  const mailboxParam = searchParams.get('mailbox');
  const mailbox = mailboxParam ? Number(mailboxParam) : undefined;
  const mailboxQ = searchParams.get('mailbox_q') ?? '';
  const q = searchParams.get('q') ?? '';

  useEffect(() => {
    if (!getToken()) router.push('/login');
  }, [router]);

  const { data: accountsData } = useQuery({
    queryKey: ['gmail-accounts'],
    queryFn: gmail.accounts,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['threads', page, filter, mailbox, mailboxQ, q],
    queryFn: () =>
      threads.list({
        page,
        filter: filter !== 'all' ? filter : undefined,
        mailbox,
        mailbox_q: mailboxQ || undefined,
        q: q || undefined,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const items = query.state.data?.data ?? [];
      return items.some(threadNeedsProcessing) ? 5_000 : 30_000;
    },
  });

  const pagination = {
    currentPage: data?.current_page ?? page,
    lastPage: data?.last_page ?? 1,
    total: data?.total ?? 0,
  };

  const mailboxes = accountsData?.data ?? [];

  return (
    <AppShell>
      <div className="container">
        <div className="page-heading">
          <div>
            <h1>Conversations</h1>
            <p>
              Filter by status and inbox. Use the mailbox search or Ctrl+K for subjects and senders.
            </p>
          </div>
        </div>

        <div className="panel">
          <Suspense fallback={null}>
            <ConversationList
              threads={data?.data ?? []}
              mailboxes={mailboxes}
              loading={isLoading && !data}
              fetching={isFetching}
              pagination={pagination}
            />
          </Suspense>
        </div>
      </div>
    </AppShell>
  );
}

export default function ThreadsPage() {
  return (
    <Suspense fallback={null}>
      <ThreadsContent />
    </Suspense>
  );
}
