<?php

namespace App\Policies;

use App\Models\GmailThread;
use App\Models\User;
use App\Policies\Concerns\OwnsGmailAccount;

class GmailThreadPolicy
{
    use OwnsGmailAccount;

    public function view(User $user, GmailThread $thread): bool
    {
        return $this->userOwnsGmailAccount($user, $thread->gmail_account_id);
    }

    public function update(User $user, GmailThread $thread): bool
    {
        return $this->userOwnsGmailAccount($user, $thread->gmail_account_id);
    }
}
