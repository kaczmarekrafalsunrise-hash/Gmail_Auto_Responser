<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\GmailMessage */
class MessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'from_email' => $this->from_email,
            'subject' => $this->subject,
            'body_text' => $this->when($this->body_text !== null, $this->body_text),
            'received_at' => $this->received_at,
            'classification' => $this->whenLoaded('classification', fn () => $this->classification ? [
                'id' => $this->classification->id,
                'label' => $this->classification->label,
                'confidence' => $this->classification->confidence,
                'model' => $this->classification->model,
                'extracted_keywords' => $this->classification->extracted_keywords,
            ] : null),
            'draft_reply' => $this->whenLoaded('draftReply', fn () => $this->draftReply ? [
                'id' => $this->draftReply->id,
                'body' => $this->draftReply->body,
                'status' => $this->draftReply->status,
                'gmail_draft_id' => $this->draftReply->gmail_draft_id,
                'approved_at' => $this->draftReply->approved_at,
            ] : null),
        ];
    }
}
