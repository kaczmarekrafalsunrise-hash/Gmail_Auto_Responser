<?php

namespace App\Console\Commands;

use App\Enums\SyncTrigger;
use App\Jobs\ProcessGmailHistoryJob;
use App\Models\GmailAccount;
use App\Services\GmailService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class PollGmailAccounts extends Command
{
    protected $signature = 'gmail:poll';

    protected $description = 'Poll active Gmail accounts for new mail (fallback when Pub/Sub is not configured)';

    public function handle(GmailService $gmailService): int
    {
        $accounts = GmailAccount::whereIn('status', ['active', 'watch_expired', 'error'])
            ->whereNotNull('last_history_id')
            ->get();

        if ($accounts->isEmpty()) {
            $this->comment('No mailboxes to process.');

            return self::SUCCESS;
        }

        $pollMinute = now()->format('Y-m-d-H-i');
        $usePoll = ! $gmailService->isPubSubConfigured();
        $failed = 0;

        foreach ($accounts as $account) {
            if ($usePoll) {
                $correlationId = 'poll-'.$account->id.'-'.$pollMinute;
                try {
                    ProcessGmailHistoryJob::dispatchSync($account->id, SyncTrigger::Poll, $correlationId);
                    $this->info("Polled {$account->gmail_email}");
                } catch (\Throwable $e) {
                    $failed++;
                    Log::error('gmail:poll failed for mailbox', [
                        'gmail_account_id' => $account->id,
                        'email' => $account->gmail_email,
                        'error' => $e->getMessage(),
                    ]);
                    $this->error("Poll failed for {$account->gmail_email}: {$e->getMessage()}");
                }
            } else {
                $count = ProcessGmailHistoryJob::dispatchPendingJobs($account);
                if ($count > 0) {
                    $this->info("Queued {$count} pending job(s) for {$account->gmail_email}");
                }
            }
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
