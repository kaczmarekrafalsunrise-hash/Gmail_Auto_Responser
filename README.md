# Gmail Auto-Responder

Take-home project: connect Gmail via OAuth, classify inbound mail, generate draft replies with an LLM, and let a human approve before anything sends.

Stack: Laravel 11, Next.js 14 (App Router + TypeScript), Gmail API, OpenAI (keyword stub if the API key is missing).

Local dev uses SQLite. No Docker, MySQL, or Redis needed.

**Architecture & design decisions:** see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — assignment mapping, system design, latency, failure handling, and production plan.

## Flow

1. Register / sign in
2. Connect one or more Gmail accounts (single Google OAuth app)
3. New mail syncs into the DB
4. Backend classifies the message and drafts a reply
5. You review on the dashboard, edit if needed, then approve & send or reject

Labels: `interested`, `meeting_request`, `not_interested`, `unclear`.

Nothing auto-sends. Each user only sees their own mail.

## Setup

**Requirements:** PHP 8.2+ (`pdo_sqlite`, `mbstring`, `openssl`), Composer, Node 18+.

### Backend

```cmd
cd backend
copy .env.example .env
type nul > database\database.sqlite
composer install
php artisan key:generate
php artisan migrate
```

Add to `backend\.env`:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
OPENAI_API_KEY=sk-your-key
```
### Frontend

```cmd
cd ..\frontend
copy .env.local.example .env.local
npm install
```

### Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com) → enable Gmail API
2. OAuth consent screen (External) → Audience → add your Gmails as a test user
3. Create a Web OAuth client
4. Redirect URI: `http://localhost:8000/api/gmail/callback`
5. Copy client ID + secret into `backend\.env`

Scopes: `gmail.readonly`, `gmail.compose`, `gmail.modify`.

Pub/Sub is not needed locally — the scheduler polls Gmail every minute.

## Run

Three terminals. `QUEUE_CONNECTION=sync` in `.env` runs jobs inline (no separate queue worker).

```cmd
cd backend && php artisan serve
```

```cmd
cd backend && php artisan schedule:work
```

```cmd
cd frontend && npm run dev
```

- Frontend: http://localhost:3000
- API: http://localhost:8000

Keep all three running. You can also hit **Sync now** on Mailboxes, or stay on that page for auto-sync every 60s.

## Smoke test

1. Register at http://localhost:3000
2. Mailboxes → Connect Gmail
3. From a **different** Gmail account, send a test email to the connected inbox
4. Wait ~60s or click Sync now
5. Conversations → thread should show classification + draft
6. Approve & send or reject

Mail sent from the connected account to itself is treated as outbound and skipped.

Logs: `backend\storage\logs\laravel.log`

## Architecture (short)

```
users → gmail_accounts → gmail_threads → gmail_messages
                              ├── classifications
                              └── draft_replies
```

**Local:** `gmail:poll` every minute (`schedule:work`) triggers the same sync job as production webhooks would.

**Production path:** Gmail Pub/Sub watch → `POST /api/webhooks/gmail/pubsub` → `ProcessGmailHistoryJob` → classify + draft jobs on `gmail-sync` / `ai` queues (Redis in prod; sync locally).

Idempotency: processed notification IDs, per-account sync lock, token refresh with cache lock. If Gmail history is too old, the mailbox goes to error state and needs a reconnect/resync. If the Gmail draft API fails, the draft is still saved in the DB.

Health: `GET /up`

## Known limits (local)

- SQLite instead of MySQL
- Polling instead of Pub/Sub push
- OAuth in Google testing mode (test users only)
- Jobs run synchronously via `QUEUE_CONNECTION=sync`

## Project layout

```
backend/    Laravel API, Gmail + LLM services, jobs
frontend/   Next.js dashboard
```
