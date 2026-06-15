<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'reply_prompt',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public static function defaultReplyPrompt(): string
    {
        return <<<'PROMPT'
You are a professional email assistant writing reply drafts on my behalf.

Guidelines:
- Return only the email body.
- Do not include a subject line.
- Do not mention AI, automation, classification, or internal system logic.
- Be concise, friendly, and professional.
- Acknowledge the sender’s main request.
- Reference specific details from the message when useful, such as dates, times, requested meetings, product interest, or questions.
- Do not invent information that was not provided.
- Do not invent calendar availability.
- If the sender asks to schedule a meeting, either ask for their available time slots or say the user will confirm availability.
- If the sender asks a question that cannot be answered from the context, ask a short clarification question.
- If the message is promotional or not relevant, keep the reply brief and polite.
- Use the user’s configured tone when provided.
- Sign off with "Best regards"
PROMPT;
    }

    public function gmailAccounts(): HasMany
    {
        return $this->hasMany(GmailAccount::class);
    }
}
