<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MessageResource;
use App\Http\Resources\ThreadResource;
use App\Jobs\ClassifyMessageJob;
use App\Jobs\GenerateDraftJob;
use App\Models\Classification;
use App\Models\GmailMessage;
use App\Models\GmailThread;
use App\Services\ThreadListService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class ThreadController extends Controller
{
    public function __construct(private ThreadListService $threadList) {}

    public function count(Request $request): JsonResponse
    {
        return response()->json([
            'total' => $this->threadList->countForUser($request->user()),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $threads = $this->threadList->paginateForUser($request->user(), $request);

        return response()->json([
            'data' => ThreadResource::collection($threads->items())->resolve($request),
            'current_page' => $threads->currentPage(),
            'last_page' => $threads->lastPage(),
            'total' => $threads->total(),
        ]);
    }

    public function show(Request $request, GmailThread $thread): JsonResponse
    {
        $this->authorize('view', $thread);

        $thread->load(['messages.classification', 'messages.draftReply', 'gmailAccount']);

        foreach ($thread->messages as $message) {
            $needsPipeline = ! $message->classification
                || (! $message->draftReply && $message->classification?->label !== Classification::LABEL_NOT_INTERESTED);

            if ($needsPipeline) {
                $cacheKey = 'pipeline:queued:'.$message->id;
                if (Cache::add($cacheKey, true, 300)) {
                    ClassifyMessageJob::dispatch($message->id)->afterResponse();
                }
            }
        }

        return response()->json((new ThreadResource($thread))->resolve($request));
    }

    public function markSeen(Request $request, GmailThread $thread): JsonResponse
    {
        $request->merge(['state' => 1]);

        return $this->updateNotificationState($request, $thread);
    }

    public function updateNotificationState(Request $request, GmailThread $thread): JsonResponse
    {
        $this->authorize('update', $thread);

        $validated = $request->validate([
            'state' => ['required', 'integer', 'in:0,1'],
        ]);

        $thread->update(['notification_state' => $validated['state']]);

        return response()->json(['notification_state' => (int) $validated['state']]);
    }

    public function message(Request $request, GmailMessage $message): JsonResponse
    {
        $this->authorize('view', $message);

        $message->load(['classification', 'draftReply', 'thread', 'gmailAccount']);

        return response()->json((new MessageResource($message))->resolve($request));
    }

    public function generateDraft(Request $request, GmailMessage $message): JsonResponse
    {
        $this->authorize('process', $message);

        $message->load(['classification', 'draftReply']);

        if ($message->draftReply) {
            return response()->json((new MessageResource($message->load(['classification', 'draftReply', 'thread', 'gmailAccount'])))->resolve($request));
        }

        if (! $message->classification) {
            ClassifyMessageJob::dispatchSync($message->id);
            $message->refresh()->load(['classification', 'draftReply']);
        }

        if ($message->classification?->label === Classification::LABEL_NOT_INTERESTED) {
            return response()->json(['message' => 'Drafts are not generated for not_interested mail.'], 422);
        }

        if (! $message->draftReply) {
            GenerateDraftJob::dispatchSync($message->id);
        }

        return response()->json((new MessageResource(
            $message->fresh()->load(['classification', 'draftReply', 'thread', 'gmailAccount'])
        ))->resolve($request));
    }

    public function process(Request $request, GmailMessage $message): JsonResponse
    {
        $this->authorize('process', $message);

        try {
            ClassifyMessageJob::dispatchSync($message->id);
            $message->refresh()->load(['classification', 'draftReply', 'thread', 'gmailAccount']);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => $e->getMessage()], 500);
        }

        if (! $message->classification) {
            return response()->json(['message' => 'Classification failed'], 500);
        }

        if (! $message->draftReply && $message->classification->label !== Classification::LABEL_NOT_INTERESTED) {
            return response()->json([
                'message' => 'Draft was not created. Reconnect Gmail on Mailboxes or check backend logs.',
                'classification' => $message->classification,
            ], 500);
        }

        return response()->json((new MessageResource($message))->resolve($request));
    }
}
