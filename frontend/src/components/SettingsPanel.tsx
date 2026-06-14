'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { getToken, settings } from '@/lib/api';

export default function SettingsPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [replyPrompt, setReplyPrompt] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getToken()) router.push('/login');
  }, [router]);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settings.get(),
  });

  useEffect(() => {
    if (data?.reply_prompt) setReplyPrompt(data.reply_prompt);
  }, [data?.reply_prompt]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await settings.updateReplyPrompt(replyPrompt);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="page-heading">
          <div>
            <h1>Settings</h1>
            <p>Customize how the AI writes reply drafts for your incoming emails.</p>
          </div>
        </div>

        {isLoading ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : (
          <form onSubmit={handleSave} className="card">
            <h2 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Reply message prompt</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              This prompt is sent to the LLM for every draft. Include tone, what to mention, and how to sign off.
              {data?.llm_driver && (
                <>
                  {' '}
                  Current model: <strong>{data.llm_model}</strong> ({data.llm_driver} driver).
                </>
              )}
            </p>
            <textarea
              rows={12}
              value={replyPrompt}
              onChange={(e) => setReplyPrompt(e.target.value)}
              placeholder="Describe how replies should be written..."
              required
              minLength={20}
            />
            {error && <p className="error">{error}</p>}
            <button
              type="submit"
              className={`btn btn-primary${saving ? ' btn--loading' : ''}`}
              style={{ marginTop: '1rem' }}
              disabled={saving}
            >
              {saving && <span className="btn-spinner" aria-hidden="true" />}
              {saving ? 'Saving...' : 'Save prompt'}
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
