'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/profile';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        setError((data.error as string) || 'Something went wrong.');
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container narrow">
      <div className="card auth-card">
        <span className="pill-tag">{isRegister ? 'Create account' : 'Welcome back'}</span>
        <h1 className="serif">{isRegister ? 'Sign up' : 'Log in'}</h1>
        <p className="muted">
          {isRegister
            ? 'Create a local account to save your exams and resume them later.'
            : 'Log in to resume your exam sessions and see your stats.'}
        </p>

        <form onSubmit={submit} className="auth-form">
          <label className="field-label" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="input"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={32}
          />

          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            maxLength={200}
          />

          {error && <p className="auth-error">{error}</p>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="muted small auth-switch">
          {isRegister ? (
            <>
              Already have an account? <Link href="/login">Log in</Link>
            </>
          ) : (
            <>
              New here? <Link href="/register">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
