<?php

namespace App\Policies\Concerns;

use App\Models\User;

trait OwnsGmailAccount
{
    protected function userOwnsGmailAccount(User $user, int $gmailAccountId): bool
    {
        return $user->gmailAccounts()->whereKey($gmailAccountId)->exists();
    }
}
