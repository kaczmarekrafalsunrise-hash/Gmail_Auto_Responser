<?php

namespace App\Enums;

enum SyncTrigger: string
{
    case PubSub = 'pubsub';
    case Poll = 'poll';
    case Manual = 'manual';
    case Auto = 'auto';
    case PendingOnly = 'pending_only';

    public function fetchesFromGmail(): bool
    {
        return match ($this) {
            self::PubSub, self::Poll, self::Manual, self::Auto => true,
            self::PendingOnly => false,
        };
    }

    public function recordsProcessedNotification(): bool
    {
        return $this === self::PubSub;
    }
}
