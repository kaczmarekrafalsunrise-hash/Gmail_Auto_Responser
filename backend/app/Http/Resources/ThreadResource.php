<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\GmailThread */
class ThreadResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'subject' => $this->subject,
            'snippet' => $this->snippet,
            'last_message_at' => $this->last_message_at,
            'notification_state' => $this->notification_state,
            'gmail_account' => $this->whenLoaded('gmailAccount', fn () => $this->gmailAccount ? [
                'id' => $this->gmailAccount->id,
                'gmail_email' => $this->gmailAccount->gmail_email,
            ] : null),
            'messages' => MessageResource::collection($this->whenLoaded('messages')),
        ];
    }
}
