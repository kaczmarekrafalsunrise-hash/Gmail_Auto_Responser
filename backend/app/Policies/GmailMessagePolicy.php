<?php

namespace App\Policies;

use App\Models\GmailMessage;
use App\Models\User;
use App\Policies\Concerns\OwnsGmailAccount;

class GmailMessagePolicy
{
    use OwnsGmailAccount;

    public function view(User $user, GmailMessage $message): bool
    {
        return $this->userOwnsGmailAccount($user, $message->gmail_account_id);
    }

    public function process(User $user, GmailMessage $message): bool
    {
        return $this->userOwnsGmailAccount($user, $message->gmail_account_id);
    }
}
