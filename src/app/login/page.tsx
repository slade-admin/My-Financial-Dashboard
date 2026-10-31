/**
 * /login page
 *
 * Full-page login form with glassmorphic card design.
 * On success, redirects to `?next` param or the dashboard root.
 */
'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import AuthStyles from '@/app/_components/AuthStyles';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }

      router.replace(next);
      router.refresh();
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Logo & heading */}
        <div className="login-logo">
          <span className="logo-icon">📊</span>
          <h1 className="logo-title">HisaKenya</h1>
          <p className="logo-subtitle">Personal Wealth Dashboard</p>
        </div>

        <h2 className="login-heading">Welcome back</h2>
        <p className="login-subheading">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="login-form" id="login-form">
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">Email address</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder="you@example.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password" className="form-label">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="form-error" role="alert" id="login-error">
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            id="login-submit"
            disabled={loading}
          >
            {loading ? (
              <span className="btn-loading"><span className="spinner" />Signing in…</span>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="login-footer">
          Don&apos;t have an account?{' '}
          <Link href="/signup" id="login-signup-link" className="link">
            Create one
          </Link>
        </p>
      </div>

      <AuthStyles />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
