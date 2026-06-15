<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DraftReply;
use App\Models\GmailMessage;
use App\Models\GmailThread;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $accountIds = $request->user()->gmailAccounts()->pluck('id');

        if ($accountIds->isEmpty()) {
            return response()->json(['data' => []]);
        }

        $messages = GmailMessage::query()
            ->select(['id', 'gmail_thread_id', 'gmail_account_id', 'received_at'])
            ->with([
                'draftReply:id,gmail_message_id,status,approved_at',
                'thread:id,subject,notification_state,gmail_account_id',
            ])
            ->whereIn('gmail_account_id', $accountIds)
            ->whereHas('draftReply', function ($q) {
                $q->whereIn('status', [DraftReply::STATUS_PENDING, DraftReply::STATUS_SENT]);
            })
            ->whereHas('thread', fn ($q) => $q->where('notification_state', 0))
            ->orderByDesc('received_at')
            ->limit(50)
            ->get();

        $notifications = [];

        foreach ($messages as $message) {
            $thread = $message->thread;
            $draft = $message->draftReply;

            if (! $thread || ! $draft) {
                continue;
            }

            if ($draft->status === DraftReply::STATUS_PENDING) {
                $notifications[] = [
                    'id' => 'review:'.$thread->id,
                    'type' => 'needs_review',
                    'title' => 'Draft needs review',
                    'body' => $thread->subject ?: '(no subject)',
                    'thread_id' => $thread->id,
                    'created_at' => $message->received_at?->toIso8601String(),
                ];
            } elseif ($draft->status === DraftReply::STATUS_SENT) {
                $notifications[] = [
                    'id' => 'sent:'.$thread->id.':'.$draft->id,
                    'type' => 'sent',
                    'title' => 'Auto-reply sent',
                    'body' => $thread->subject ?: '(no subject)',
                    'thread_id' => $thread->id,
                    'created_at' => ($draft->approved_at ?? $message->received_at)?->toIso8601String(),
                ];
            }
        }

        usort($notifications, fn (array $a, array $b) => strcmp($b['created_at'] ?? '', $a['created_at'] ?? ''));

        return response()->json(['data' => array_slice($notifications, 0, 25)]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $accountIds = $request->user()->gmailAccounts()->pluck('id');

        if ($accountIds->isEmpty()) {
            return response()->json(['message' => 'ok']);
        }

        GmailThread::whereIn('gmail_account_id', $accountIds)
            ->where('notification_state', 0)
            ->update(['notification_state' => 1]);

        return response()->json(['message' => 'ok']);
    }
}
