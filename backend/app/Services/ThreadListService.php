<?php

namespace App\Services;

use App\Models\DraftReply;
use App\Models\GmailMessage;
use App\Models\GmailThread;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

class ThreadListService
{
    public function countForUser(User $user): int
    {
        $accountIds = $user->gmailAccounts()->pluck('id');

        if ($accountIds->isEmpty()) {
            return 0;
        }

        $cacheKey = 'threads:count:'.$user->id;

        return (int) Cache::remember($cacheKey, 30, fn () => GmailThread::whereIn('gmail_account_id', $accountIds)->count());
    }

    public function paginateForUser(User $user, Request $request): LengthAwarePaginator
    {
        $accountIds = $user->gmailAccounts()->pluck('id');

        if ($accountIds->isEmpty()) {
            return GmailThread::query()->whereRaw('0 = 1')->paginate(20);
        }

        $query = GmailThread::query()
            ->select([
                'id',
                'gmail_account_id',
                'subject',
                'snippet',
                'last_message_at',
                'notification_state',
            ])
            ->with(['gmailAccount:id,gmail_email'])
            ->whereIn('gmail_account_id', $accountIds);

        $this->applyFilters($query, $request, $accountIds);

        $threads = $query->orderByDesc('last_message_at')->paginate(20);

        $latestByThread = $this->loadLatestMessages($threads->getCollection()->pluck('id'));

        $threads->getCollection()->transform(
            fn (GmailThread $thread) => $this->attachLatestMessage($thread, $latestByThread->get($thread->id))
        );

        return $threads;
    }

    /** @param  Collection<int, int>  $accountIds */
    private function applyFilters(Builder $query, Request $request, Collection $accountIds): void
    {
        $search = trim((string) $request->query('q', ''));
        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($q) use ($like) {
                $q->where('subject', 'like', $like)
                    ->orWhere('snippet', 'like', $like);
            });
        }

        $filter = (string) $request->query('filter', 'all');
        if ($filter === 'needs_review') {
            $this->applyDraftStatusFilter($query, DraftReply::STATUS_PENDING);
        } elseif ($filter === 'sent') {
            $this->applyDraftStatusFilter($query, DraftReply::STATUS_SENT);
        }

        $label = (string) $request->query('label', 'all');
        if ($label !== '' && $label !== 'all') {
            $query->whereExists(function ($sub) use ($label) {
                $sub->from('gmail_messages as gm')
                    ->join('classifications as c', 'c.gmail_message_id', '=', 'gm.id')
                    ->whereColumn('gm.gmail_thread_id', 'gmail_threads.id')
                    ->where('c.label', $label);
            });
        }

        $mailboxId = (int) $request->query('mailbox', 0);
        if ($mailboxId > 0 && $accountIds->contains($mailboxId)) {
            $query->where('gmail_account_id', $mailboxId);
        } else {
            $mailboxQ = trim((string) $request->query('mailbox_q', ''));
            if ($mailboxQ !== '') {
                $like = '%'.$mailboxQ.'%';
                $query->whereHas('gmailAccount', fn ($q) => $q->where('gmail_email', 'like', $like));
            }
        }
    }

    private function applyDraftStatusFilter(Builder $query, string $status): void
    {
        $query->whereExists(function ($sub) use ($status) {
            $sub->from('gmail_messages as gm')
                ->join('draft_replies as dr', 'dr.gmail_message_id', '=', 'gm.id')
                ->whereColumn('gm.gmail_thread_id', 'gmail_threads.id')
                ->where('dr.status', $status);
        });
    }

    /** @param  Collection<int, int>  $threadIds */
    private function loadLatestMessages(Collection $threadIds): Collection
    {
        if ($threadIds->isEmpty()) {
            return collect();
        }

        $latestPerThread = GmailMessage::query()
            ->select('gmail_thread_id')
            ->selectRaw('MAX(received_at) as max_received_at')
            ->whereIn('gmail_thread_id', $threadIds)
            ->groupBy('gmail_thread_id');

        return GmailMessage::query()
            ->select([
                'gmail_messages.id',
                'gmail_messages.gmail_thread_id',
                'gmail_messages.gmail_account_id',
                'gmail_messages.from_email',
                'gmail_messages.subject',
                'gmail_messages.received_at',
            ])
            ->joinSub($latestPerThread, 'latest', function ($join) {
                $join->on('gmail_messages.gmail_thread_id', '=', 'latest.gmail_thread_id')
                    ->on('gmail_messages.received_at', '=', 'latest.max_received_at');
            })
            ->with([
                'classification:id,gmail_message_id,label,confidence',
                'draftReply:id,gmail_message_id,status',
            ])
            ->get()
            ->keyBy('gmail_thread_id');
    }

    private function attachLatestMessage(GmailThread $thread, ?GmailMessage $latest): GmailThread
    {
        $thread->setRelation('messages', $latest ? collect([$latest]) : collect());
        $thread->notification_state = $this->listNotificationState($thread, $latest);

        return $thread;
    }

    private function listNotificationState(GmailThread $thread, ?GmailMessage $latest): int
    {
        if ((int) $thread->getAttributes()['notification_state'] === 1) {
            return 1;
        }

        $draft = $latest?->draftReply;
        if ($draft && in_array($draft->status, [DraftReply::STATUS_PENDING, DraftReply::STATUS_SENT], true)) {
            return 0;
        }

        return (int) ($thread->getAttributes()['notification_state'] ?? 0);
    }

    public static function markThreadUnread(GmailThread $thread): void
    {
        $thread->update(['notification_state' => 0]);
    }

    public static function unreadFromDraft(DraftReply $draft): void
    {
        $draft->loadMissing('gmailMessage.thread');
        $draft->gmailMessage?->thread?->update(['notification_state' => 0]);
    }
}
