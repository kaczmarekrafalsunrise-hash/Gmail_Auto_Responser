'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, setToken, markWelcomePending } from '@/lib/api';
import { RevReplyBrand } from '@/components/AppNav';
import { AuthSubmitButton } from '@/components/AuthSubmitButton';
import { PasswordInput } from '@/components/PasswordInput';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await auth.register({
        name,
        email,
        password,
        password_confirmation: passwordConfirmation,
      });
      setToken(res.token);
      markWelcomePending({ isNewUser: true });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <RevReplyBrand center tagline="AI Gmail Assistant" />
        <h1>Create account</h1>
        {error && <p className="error">{error}</p>}
        <form onSubmit={handleSubmit} className="card">
          <label htmlFor="register-name">Name</label>
          <input
            id="register-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
            autoComplete="name"
          />
          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            autoComplete="email"
          />
          <label htmlFor="register-password">Password</label>
          <PasswordInput
            id="register-password"
            value={password}
            onChange={setPassword}
            required
            disabled={loading}
            autoComplete="new-password"
          />
          <label htmlFor="register-password-confirm">Confirm password</label>
          <PasswordInput
            id="register-password-confirm"
            value={passwordConfirmation}
            onChange={setPasswordConfirmation}
            required
            disabled={loading}
            autoComplete="new-password"
          />
          <AuthSubmitButton loading={loading} loadingLabel="Creating account…" label="Register" />
        </form>
        <p style={{ marginTop: '1rem', color: 'var(--muted)', textAlign: 'center' }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
