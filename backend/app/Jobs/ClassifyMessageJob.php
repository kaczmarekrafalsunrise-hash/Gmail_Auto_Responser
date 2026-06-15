<?php

namespace App\Jobs;

use App\Models\Classification;
use App\Models\GmailMessage;
use App\Services\LlmService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ClassifyMessageJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public int $gmailMessageId)
    {
        $this->onQueue('ai');
    }

    public function handle(LlmService $llmService): void
    {
        $message = GmailMessage::with(['classification', 'draftReply'])->find($this->gmailMessageId);

        if (! $message) {
            return;
        }

        if ($message->classification) {
            if (! $message->draftReply && $message->classification->label !== Classification::LABEL_NOT_INTERESTED) {
                GenerateDraftJob::dispatch($message->id);
            }

            return;
        }

        $result = $llmService->classify(
            $message->subject ?? '',
            $message->body_text ?? ''
        );

        $classification = Classification::create([
            'gmail_message_id' => $message->id,
            'label' => $result['label'],
            'confidence' => $result['confidence'],
            'model' => $result['model'],
            'raw_response' => $result['raw_response'],
            'extracted_keywords' => $result['keywords'] ?? [],
        ]);

        if ($classification->label !== Classification::LABEL_NOT_INTERESTED) {
            GenerateDraftJob::dispatch($message->id);
        }
    }
}
