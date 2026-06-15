<?php

namespace App\Policies;

use App\Models\GmailAccount;
use App\Models\User;

class GmailAccountPolicy
{
    public function view(User $user, GmailAccount $account): bool
    {
        return $account->user_id === $user->id;
    }

    public function delete(User $user, GmailAccount $account): bool
    {
        return $account->user_id === $user->id;
    }

    public function sync(User $user, GmailAccount $account): bool
    {
        return $account->user_id === $user->id;
    }
}
