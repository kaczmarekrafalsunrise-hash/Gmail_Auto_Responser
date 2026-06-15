<?php

namespace Tests\Feature;

use App\Enums\SyncTrigger;
use App\Models\GmailAccount;
use App\Models\ProcessedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WebhookTest extends TestCase
{
    use RefreshDatabase;

    public function test_pubsub_duplicate_notification_is_ignored(): void
    {
        $user = \App\Models\User::factory()->create();

        $account = GmailAccount::create([
            'user_id' => $user->id,
            'gmail_email' => 'inbox@example.com',
            'google_account_id' => 'inbox@example.com',
            'encrypted_refresh_token' => 'test-token',
            'status' => 'active',
            'last_history_id' => '100',
        ]);

        ProcessedNotification::create([
            'gmail_account_id' => $account->id,
            'history_id' => '999',
        ]);

        $payload = [
            'message' => [
                'data' => base64_encode(json_encode([
                    'emailAddress' => 'inbox@example.com',
                    'historyId' => '999',
                ])),
            ],
        ];

        $this->postJson('/api/webhooks/gmail/pubsub', $payload)
            ->assertOk()
            ->assertJson(['status' => 'duplicate']);
    }

    public function test_sync_trigger_enum_controls_gmail_fetch(): void
    {
        $this->assertTrue(SyncTrigger::PubSub->fetchesFromGmail());
        $this->assertFalse(SyncTrigger::PendingOnly->fetchesFromGmail());
        $this->assertTrue(SyncTrigger::PubSub->recordsProcessedNotification());
        $this->assertFalse(SyncTrigger::Poll->recordsProcessedNotification());
    }
}
