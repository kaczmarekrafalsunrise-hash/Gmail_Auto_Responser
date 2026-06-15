<?php

namespace App\Policies;

use App\Models\DraftReply;
use App\Models\User;
use App\Policies\Concerns\OwnsGmailAccount;

class DraftReplyPolicy
{
    use OwnsGmailAccount;

    public function update(User $user, DraftReply $draft): bool
    {
        $draft->loadMissing('gmailMessage');

        return $draft->gmailMessage
            && $this->userOwnsGmailAccount($user, $draft->gmailMessage->gmail_account_id);
    }
}
