<?php

namespace Tests\Feature;

use App\Models\GmailAccount;
use App\Models\GmailThread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ThreadAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_cannot_view_another_users_thread(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();

        $account = GmailAccount::create([
            'user_id' => $owner->id,
            'gmail_email' => 'owner@example.com',
            'google_account_id' => 'owner@example.com',
            'encrypted_refresh_token' => 'test-token',
            'status' => 'active',
        ]);

        $thread = GmailThread::create([
            'gmail_account_id' => $account->id,
            'gmail_thread_id' => 'thread-1',
            'subject' => 'Private thread',
        ]);

        Sanctum::actingAs($other);

        $this->getJson('/api/threads/'.$thread->id)->assertForbidden();
    }

    public function test_user_can_list_only_their_threads(): void
    {
        $user = User::factory()->create();
        $account = GmailAccount::create([
            'user_id' => $user->id,
            'gmail_email' => 'me@example.com',
            'google_account_id' => 'me@example.com',
            'encrypted_refresh_token' => 'test-token',
            'status' => 'active',
        ]);

        GmailThread::create([
            'gmail_account_id' => $account->id,
            'gmail_thread_id' => 'thread-1',
            'subject' => 'Mine',
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/threads')
            ->assertOk()
            ->assertJsonPath('data.0.subject', 'Mine');
    }
}
