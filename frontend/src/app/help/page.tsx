'use client';

import Link from 'next/link';
import { AppShell } from '@/components/AppNav';

export default function HelpPage() {
  return (
    <AppShell>
      <div className="container">
        <div className="page-heading">
          <div>
            <h1>Help</h1>
            <p>Gmail connect &amp; mailboxes</p>
          </div>
        </div>

        <div className="card help-card">
          <h2>For users (after you register)</h2>
          <ol className="help-steps">
            <li>
              <Link href="/register">Register</Link> or <Link href="/login">sign in</Link> to this app.
            </li>
            <li>
              Go to <Link href="/dashboard/mailboxes">Mailboxes</Link>.
            </li>
            <li>
              Click <strong>Connect Gmail</strong> → Google sign-in → choose the Gmail inbox to link.
            </li>
            <li>Repeat Connect Gmail for each additional mailbox you own.</li>
            <li>
              Send a test email to that inbox, click <strong>Sync now</strong>, then check{' '}
              <Link href="/threads">Conversations</Link>.
            </li>
          </ol>
        </div>

        <div className="card help-card">
          <h2>Multiple users on the same app</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
            User A and User B each register separately. Each connects their own Gmail accounts. Mailboxes are isolated
            by app login.
          </p>
          <pre className="code-block">
{`User A (alice@mycompany.com)
  └── Connect Gmail → alice.personal@gmail.com

User B (bob@other.com)
  └── Connect Gmail → bob@gmail.com`}
          </pre>
        </div>

        <div className="card help-card">
          <h2>For the developer (once per platform)</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
            Create one Google Cloud OAuth client. Put Client ID and Secret in <code>backend/.env</code>.
          </p>
          <pre className="code-block">
{`GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:8000/api/gmail/callback`}
          </pre>
          <p style={{ color: 'var(--muted)', marginTop: '1rem' }}>
            Full setup: <code>docs/GOOGLE_SETUP.md</code>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
