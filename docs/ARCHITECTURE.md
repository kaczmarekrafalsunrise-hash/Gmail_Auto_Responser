# How RevReply Works

RevReply is a Gmail assistant. A user connects one or more Gmail inboxes, new emails are synced into the app, the backend classifies each message, creates a draft reply, and the user approves or rejects the draft before anything is sent.

The goal of this take-home is not to build a complete production product. The goal is to show a working slice and explain how the system would scale safely.

Stack:

* Laravel 11 for the API and background jobs
* Next.js 14 for the dashboard
* SQLite locally
* Gmail API for mail access
* OpenAI for classification and draft generation
* Keyword fallback if OpenAI is unavailable

Setup instructions are in the root `README.md`.

---

## 1. User flow

The main product flow is:

```text
Sign up / log in
→ Connect Gmail
→ Sync incoming mail
→ Classify message
→ Generate draft reply
→ Review in dashboard
→ Approve & send or Reject
```

Nothing sends automatically. The user stays in control.

Each user only sees their own Gmail accounts, threads, messages, and drafts.

---

## 2. What works today

The current app supports:

* User registration and login
* Gmail OAuth connection
* Multiple Gmail accounts per user
* Gmail message sync
* Conversation list and thread detail pages
* Message classification:
* Draft generation through OpenAI
* Keyword-based fallback if OpenAI is not configured
* Draft review before sending
* Manual **Sync now**
* Scheduler-based polling for local development
* Pub/Sub webhook route for production direction
* Basic failure handling through logs and statuses

---

## 3. System overview

At a high level:

```text
Browser / Next.js dashboard
        ↓
Laravel API
        ↓
Database
        ↓
Background jobs
        ↓
Gmail API + OpenAI
```

The backend pipeline is:

```text
New mail detected
        ↓
ProcessGmailHistoryJob
        ↓
ClassifyMessageJob
        ↓
GenerateDraftJob
        ↓
User approves in dashboard
        ↓
Gmail API sends or saves the response
```

Locally, jobs can run inline with:

```env
QUEUE_CONNECTION=sync
```

In production, these jobs should run through Redis with separate workers.

---

## 4. Database structure

The data model starts from the user and connected Gmail accounts.

```text
users
  └── gmail_accounts
        └── gmail_threads
              └── gmail_messages
                    ├── classifications
                    └── draft_replies
```

Important tables:

| Table                     | Purpose                                                |
| ------------------------- | ------------------------------------------------------ |
| `users`                   | App users and reply prompt                             |
| `gmail_accounts`          | Connected mailboxes, OAuth tokens, sync cursor, status |
| `gmail_threads`           | Gmail conversation summary                             |
| `gmail_messages`          | Synced inbound messages                                |
| `classifications`         | AI label, confidence, keywords                         |
| `draft_replies`           | Draft body, status, Gmail draft ID                     |
| `processed_notifications` | Deduplicates Pub/Sub events                            |
| `jobs` / `failed_jobs`    | Queue storage and failed jobs                          |

Every user-facing query is scoped through the logged-in user’s Gmail accounts. A user cannot access another user’s mailbox data.

---

## 5. How new mail gets into the app

There are two ways to trigger the same pipeline.

### Local development: polling

Google cannot easily send Pub/Sub webhooks to `localhost`, so the local app polls Gmail.

```text
Laravel scheduler
→ gmail:poll
→ ProcessGmailHistoryJob
```

Run polling with:

```cmd
php artisan schedule:work
```

The user can also trigger the same sync manually:

```text
Mailboxes page
→ Sync now
→ ProcessGmailHistoryJob
```

This is useful for demos and local testing.

### Production: Pub/Sub webhook

In production, the better path is Gmail Pub/Sub.

```text
Gmail inbox changes
→ Google Pub/Sub
→ Laravel webhook
→ Queue sync job
→ Return quickly
```

The webhook should stay lightweight. It should not call Gmail or OpenAI directly. It should validate the event, deduplicate it, enqueue work, and return.

Both polling and Pub/Sub use the same backend job pipeline. Only the trigger is different.

---

## 6. Why draft-first, not auto-send

I chose draft-first approval.

Reason:

* AI can misunderstand the sender’s intent.
* Sales or customer replies have business risk.
* A wrong email is worse than a slightly slower response.
* Users should be able to edit the final message.

The safe default is:

```text
AI writes draft
→ user reviews
→ user approves or rejects
```

Auto-send could be added later only for low-risk cases, with user settings and audit logs.

---

## 7. Queue design

Slow work should not run inside normal HTTP requests.

The current logical queues are:

| Queue        | Responsibility                            |
| ------------ | ----------------------------------------- |
| `gmail-sync` | Fetch Gmail changes and save new messages |
| `ai`         | Classify messages and generate drafts     |

For production, I would split this further:

| Queue         | Responsibility                           |
| ------------- | ---------------------------------------- |
| `high`        | User-triggered actions                   |
| `gmail-sync`  | Gmail history and message sync           |
| `ai`          | Classification and draft generation      |
| `gmail-write` | Gmail draft/send operations              |
| `maintenance` | Watch renewal, fallback polling, cleanup |

This keeps Gmail sync from being blocked by slower AI work.

---

## 8. Reliability decisions

This type of system must expect duplicate events, retries, expired tokens, and external API failures.

### Duplicate events

Gmail/Pub/Sub can deliver the same event more than once.

Protection:

* `processed_notifications` table
* unique Gmail message IDs
* jobs skip work that already exists

Expected behavior:

```text
Same notification arrives twice
→ second one is ignored
```

### One sync per mailbox

Two workers should not sync the same Gmail account at the same time.

Protection:

```text
Cache::lock('gmail:sync:{accountId}')
```

This avoids duplicate work and protects the Gmail history cursor.

### Token refresh

Gmail access tokens expire. Before Gmail API calls, the backend checks the token and refreshes it if needed.

Protection:

```text
Cache::lock('gmail:token_refresh:{accountId}')
```

Only one worker refreshes a mailbox token at a time.

### Existing message or draft

If a message was already synced, or a draft already exists, the job exits early instead of creating duplicate data.

### OpenAI failure

If OpenAI is unavailable or no API key is configured, the app falls back to keyword-based behavior so the demo can still run.

---

## 9. Handling many Gmail accounts

The hard production case is not one inbox. It is many users with many connected mailboxes.

Example:

```text
1,000 users × 10 Gmail accounts = 10,000 mailboxes
```

Polling every mailbox every minute would create unnecessary load:

* too many Gmail API calls
* more token refresh pressure
* more database writes
* larger queue backlog
* worse user experience

Production strategy:

* Use Pub/Sub as the main trigger.
* Keep polling only as a low-frequency fallback.
* Queue all heavy work.
* Lock sync per mailbox.
* Rate-limit Gmail calls per mailbox.
* Use retries with backoff.
* Keep imports and drafts idempotent.
* Show mailbox errors clearly in the dashboard.

The target behavior is:

```text
Many Gmail events arrive
→ webhook responds quickly
→ queue absorbs the spike
→ workers process gradually
→ rate-limited mailboxes wait
→ healthy mailboxes keep working
```

Adding more servers helps, but it is not enough by itself. More workers without rate limits can hit Gmail or OpenAI limits faster. The system needs queues, locks, backoff, and idempotency.

---

## 10. Failure handling

| Failure                 | Behavior                                        |
| ----------------------- | ----------------------------------------------- |
| Duplicate webhook       | Skip safely                                     |
| Invalid webhook payload | Log and reject                                  |
| Unknown mailbox         | Log and ignore                                  |
| Gmail message missing   | Skip and continue                               |
| Gmail draft API fails   | Keep local draft in DB                          |
| OpenAI unavailable      | Use fallback behavior                           |
| Token revoked           | Mark mailbox as needing reconnect               |
| Gmail history expired   | Mark mailbox error and require resync/reconnect |
| Job fails after retries | Store in failed jobs and log context            |

The dashboard should not simply break. It should show useful states such as:

```text
active
error
token_revoked
watch_expired
pending_approval
sent
rejected
```

---

## 11. LLM behavior

`LlmService` handles classification and draft writing.

When `OPENAI_API_KEY` is set:

```text
OpenAI model: gpt-4o-mini
```

When the key is missing or the API fails:

```text
keyword fallback
```

The user can customize the reply style through the Settings page. If they do not set anything, the app uses a default professional reply prompt.

---

## 12. Security and tenancy

Current security choices:

* Sanctum bearer token authentication
* OAuth state with expiration
* Gmail tokens encrypted at rest
* Gmail tokens never sent to the frontend
* User ownership checks on mailboxes, threads, messages, and drafts

Production additions:

* Pub/Sub JWT verification
* stronger rate limiting on auth and webhook endpoints
* secrets manager instead of local `.env`
* audit log for approve/reject/send actions

---

## 13. Local vs production

| Area           | Local demo                   | Production target                   |
| -------------- | ---------------------------- | ----------------------------------- |
| New mail       | Poll every minute + Sync now | Gmail Pub/Sub primary               |
| Queue          | Inline / simple local queue  | Redis + workers                     |
| Database       | SQLite                       | MySQL or Postgres                   |
| OAuth          | Google Testing mode          | Published OAuth app                 |
| Infrastructure | Local terminals              | API, workers, scheduler as services |
| Observability  | Logs and `/up`               | Sentry, metrics, alerts, Horizon    |
| Secrets        | `.env`                       | Secrets manager                     |

The local setup is optimized for easy review. The production version would be optimized for reliability and scale.

---

## 14. Performance work

The main performance issue was not CSS or page rendering. The backend was doing too much work for some list and sync paths.

### Conversation list

Before optimization, the list endpoint could load too much message data for each thread.

Improvements:

* Paginate first.
* Load only the latest message needed for the list.
* Do not send full `body_text` in the list API.
* Use smaller selected columns.
* Add indexes for thread sorting and latest-message lookup.
* Cache thread counts briefly.
* Load full message body only on the thread detail page.

Result:

```text
Conversation list work scales with page size, not total message volume.
```

### Gmail sync

Problem:

```text
Sync-all could run Gmail ingestion inside the HTTP request.
```

Fix:

```text
Return quickly
→ run sync work after response / in background job
```

This avoids long browser waits and misleading timeout/CORS-style errors.

### Frontend perceived speed

Improvements:

* avoid unnecessary `/me` calls
* gate protected queries after auth check
* reduce aggressive polling
* keep previous conversation data while filters change
* optimistically update mailbox disconnect actions

---

## 15. What I would improve next

For a production release, I would add:

* Gmail Pub/Sub as the primary ingress path.
* Slow polling only as fallback and recovery.
* Redis queues with separate workers for Gmail sync and AI.
* Per-mailbox rate limits and sync locks.
* Stronger idempotency for notifications, messages, classifications, and drafts.
* Auto-resync when Gmail history expires.
* Clear reconnect and retry states in the dashboard.
* Operational alerts for queue depth, failed jobs, webhook failures, and mailbox errors.
* Guided onboarding, reconnect banners, and optional mailbox nicknames.
* Load test around 1,000 concurrent webhook events and confirm no duplicate drafts.
* Plan-based limits for connected Gmail accounts and monthly processed messages.
* Model selection so customers can balance quality, speed, and cost.

---

## 16. Files to review first

| Area                      | Path                                                     |
| ------------------------- | -------------------------------------------------------- |
| Gmail OAuth and Gmail API | `backend/app/Services/GmailService.php`                  |
| Thread list queries       | `backend/app/Services/ThreadListService.php`             |
| Sync trigger enum         | `backend/app/Enums/SyncTrigger.php`                      |
| Authorization policies    | `backend/app/Policies/`                                  |
| Gmail sync job            | `backend/app/Jobs/ProcessGmailHistoryJob.php`            |
| Classification job        | `backend/app/Jobs/ClassifyMessageJob.php`                |
| Draft generation job      | `backend/app/Jobs/GenerateDraftJob.php`                  |
| Polling command           | `backend/app/Console/Commands/PollGmailAccounts.php`     |
| Pub/Sub webhook           | `backend/app/Http/Controllers/Api/WebhookController.php` |
| API routes                | `backend/routes/api.php`                                 |
| Feature tests             | `backend/tests/Feature/`                                 |
| LLM service               | `backend/app/Services/LlmService.php`                    |
| Dashboard UI              | `frontend/src/app/`                                      |

Logs:

```text
backend/storage/logs/laravel.log
```

Health check:

```text
GET http://localhost:8000/up
```

---

## 17. How to verify the app

Minimum test:

1. Register and log in.
2. Connect Gmail.
3. Send a test email from a different address.
4. Wait for the scheduler or click **Sync now**.
5. Open Conversations.
6. Confirm classification and draft appear.
7. Approve or reject the draft.

This proves the main flow:

```text
Gmail OAuth
→ Gmail sync
→ classification
→ draft generation
→ dashboard approval
```

---

## 18. How I would explain it in review

The system uses event-driven architecture with polling fallback. Gmail changes are pushed into a single processing pipeline, then background jobs handle sync, classification, and draft generation.

The backend is designed around mailbox isolation, idempotency, token refresh safety, and queue-based processing. The local app uses polling because localhost cannot receive real Pub/Sub webhooks easily, but the production direction is Pub/Sub plus Redis workers.

For performance, I focused on real bottlenecks: reducing over-fetching, moving slow Gmail work out of HTTP requests, adding indexes, and improving frontend query behavior. I did not focus on premature micro-optimizations.
