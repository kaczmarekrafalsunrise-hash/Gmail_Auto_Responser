<?php

namespace App\Jobs;

use App\Enums\SyncTrigger;
use App\Models\Classification;
use App\Models\GmailAccount;
use App\Models\GmailMessage;
use App\Models\ProcessedNotification;
use App\Services\GmailService;
use App\Services\MessageSyncService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class ProcessGmailHistoryJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;

    public function __construct(
        public int $gmailAccountId,
        public SyncTrigger $trigger,
        public string $historyId = '',
    ) {
        $this->onQueue('gmail-sync');
    }

    public function backoff(): array
    {
        return [10, 30, 60, 120, 300];
    }

    public function handle(GmailService $gmailService, MessageSyncService $syncService): void
    {
        $account = GmailAccount::find($this->gmailAccountId);
        if (! $account) {
            return;
        }

        self::dispatchPendingJobs($account);

        if (! $this->trigger->fetchesFromGmail()) {
            return;
        }

        $lock = Cache::lock('gmail:sync:'.$this->gmailAccountId, 55);

        if (! $lock->get()) {
            return;
        }

        try {
            $this->runSync($gmailService, $syncService, $account);
        } finally {
            $lock->release();
            self::dispatchPendingJobs($account->fresh());
        }
    }

    private function runSync(GmailService $gmailService, MessageSyncService $syncService, GmailAccount $account): void
    {
        if ($this->trigger->recordsProcessedNotification()
            && $this->historyId !== ''
            && ProcessedNotification::where('gmail_account_id', $account->id)
                ->where('history_id', $this->historyId)
                ->exists()) {
            return;
        }

        $startHistoryId = $account->last_history_id;

        if (! $startHistoryId) {
            Log::warning('No last_history_id for account', ['gmail_account_id' => $account->id]);

            return;
        }

        try {
            $result = $gmailService->fetchHistoryChanges($account, $startHistoryId);
        } catch (\RuntimeException $e) {
            if ($e->getMessage() === 'history_too_old') {
                $account->update(['status' => 'error']);
            }
            throw $e;
        }

        $syncedCount = 0;

        foreach ($result['message_ids'] as $messageId) {
            try {
                $message = $syncService->syncMessage($account, $messageId);
                if ($message) {
                    $syncedCount++;
                }
            } catch (\Throwable $e) {
                Log::warning('Skipped message during sync', [
                    'gmail_account_id' => $account->id,
                    'message_id' => $messageId,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $latest = $result['latest_history_id'] ?? null;
        if ($latest && (int) $latest > (int) $startHistoryId) {
            $account->update(['last_history_id' => $latest]);
        }

        if ($this->trigger->recordsProcessedNotification() && $this->historyId !== '') {
            ProcessedNotification::create([
                'gmail_account_id' => $account->id,
                'history_id' => $this->historyId,
            ]);
        }

        Log::info('Gmail sync finished', [
            'gmail_account_id' => $account->id,
            'trigger' => $this->trigger->value,
            'history_id' => $this->historyId,
            'messages_found' => count($result['message_ids']),
            'messages_synced' => $syncedCount,
        ]);
    }

    public static function dispatchPendingJobs(GmailAccount $account): int
    {
        $messageIds = self::pendingMessageIds($account);

        foreach ($messageIds as $messageId) {
            ClassifyMessageJob::dispatch($messageId);
        }

        return $messageIds->count();
    }

    /** @return Collection<int, int> */
    public static function pendingMessageIds(GmailAccount $account): Collection
    {
        return GmailMessage::query()
            ->where('gmail_account_id', $account->id)
            ->where(function ($query) {
                $query->whereDoesntHave('classification')
                    ->orWhere(function ($query) {
                        $query->whereHas('classification', function ($query) {
                            $query->where('label', '!=', Classification::LABEL_NOT_INTERESTED);
                        })->whereDoesntHave('draftReply');
                    });
            })
            ->orderBy('id')
            ->pluck('id');
    }
}
