<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;

class GmailThread extends Model
{
    protected $fillable = [
        'gmail_account_id',
        'gmail_thread_id',
        'subject',
        'snippet',
        'last_message_at',
        'notification_state',
    ];

    protected function casts(): array
    {
        return [
            'last_message_at' => 'datetime',
            'notification_state' => 'integer',
        ];
    }

    /**
     * 0 = unread (show in notifications), 1 = read.
     * Falls back from draft status when the DB column is missing or stale.
     */
    public function effectiveNotificationState(): int
    {
        $stored = $this->attributes['notification_state'] ?? null;
        if ($stored !== null && (int) $stored === 1) {
            return 1;
        }

        $messages = $this->relationLoaded('messages') ? $this->messages : $this->messages()->with('draftReply')->get();

        foreach ($messages as $message) {
            $draft = $message->relationLoaded('draftReply') ? $message->draftReply : $message->draftReply;
            if ($draft && in_array($draft->status, [DraftReply::STATUS_PENDING, DraftReply::STATUS_SENT], true)) {
                return 0;
            }
        }

        return $stored !== null ? (int) $stored : 0;
    }

    public function applyEffectiveNotificationState(): self
    {
        $this->setAttribute('notification_state', $this->effectiveNotificationState());

        return $this;
    }

    public function gmailAccount(): BelongsTo
    {
        return $this->belongsTo(GmailAccount::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(GmailMessage::class);
    }
}
