'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, setToken, markWelcomePending } from '@/lib/api';
import { RevReplyBrand } from '@/components/AppNav';
import { AuthSubmitButton } from '@/components/AuthSubmitButton';
import { PasswordInput } from '@/components/PasswordInput';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await auth.login({ email, password });
      setToken(res.token);
      markWelcomePending();
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <RevReplyBrand center tagline="AI Gmail Assistant" />
        <h1>Sign in</h1>
        {error && <p className="error">{error}</p>}
        <form onSubmit={handleSubmit} className="card">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            autoComplete="email"
          />
          <label htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={setPassword}
            required
            disabled={loading}
            autoComplete="current-password"
          />
          <AuthSubmitButton loading={loading} loadingLabel="Signing in…" label="Sign in" />
        </form>
        <p style={{ marginTop: '1rem', color: 'var(--muted)', textAlign: 'center' }}>
          No account? <Link href="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
