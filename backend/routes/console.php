<?php

use App\Jobs\ProcessGmailHistoryJob;
use App\Models\GmailAccount;
use Illuminate\Support\Facades\Artisan;

Artisan::command('gmail:process-pending', function () {
    $accounts = GmailAccount::whereIn('status', ['active', 'watch_expired', 'error'])
        ->whereNotNull('last_history_id')
        ->get();

    $total = 0;
    foreach ($accounts as $account) {
        $count = ProcessGmailHistoryJob::dispatchPendingJobs($account);
        $total += $count;
        if ($count > 0) {
            $this->info("{$account->gmail_email}: {$count} message(s) queued");
        }
    }

    if ($total === 0) {
        $this->comment('No pending messages.');
    } else {
        $this->info("Done. {$total} message(s) queued.");
    }
})->purpose('Queue classify/draft jobs for unprocessed messages');
