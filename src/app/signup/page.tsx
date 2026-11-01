/**
 * /signup page
 *
 * The proxy already whitelisted /signup as a public route and the login page
 * links to it, but the page itself did not exist — the link 404'd.
 *
 * Posts to /api/auth/signup, which creates the user and sets the session
 * cookie in the same response, so a successful signup lands straight on the
 * dashboard with no second login step.
 */
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthStyles from '@/app/_components/AuthStyles';

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    // Mirror the server-side rule so the user gets feedback without a round trip.
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          // Omit empty optional fields rather than sending '' — the repo layer
          // stores undefined as NULL, but '' would persist as an empty string.
          phone_number: phone.trim() || undefined,
          dob: dob || undefined,
          country: 'KE',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Signup failed');
        return;
      }

      // The session cookie is already set by the signup response.
      router.replace('/');
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
        <div className="login-logo">
          <span className="logo-icon">📊</span>
          <h1 className="logo-title">Track-suite</h1>
          <p className="logo-subtitle">Personal Wealth Dashboard</p>
        </div>

        <h2 className="login-heading">Create your account</h2>
        <p className="login-subheading">Start tracking your net worth in minutes</p>

        <form onSubmit={handleSubmit} className="login-form" id="signup-form">
          <div className="form-group">
            <label htmlFor="signup-name" className="form-label">Full name</label>
            <input
              id="signup-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="form-input"
              placeholder="Kevin Mwangi"
              required
              autoComplete="name"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="signup-email" className="form-label">Email address</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="signup-password" className="form-label">Password</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <span className="form-hint">Minimum 8 characters.</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="signup-phone" className="form-label">Phone (optional)</label>
              <input
                id="signup-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="form-input"
                placeholder="07xx xxx xxx"
                autoComplete="tel"
              />
            </div>

            <div className="form-group">
              <label htmlFor="signup-dob" className="form-label">Date of birth (optional)</label>
              <input
                id="signup-dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="form-input"
                autoComplete="bday"
              />
            </div>
          </div>

          {error && (
            <div className="form-error" role="alert" id="signup-error">
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            id="signup-submit"
            disabled={loading}
          >
            {loading ? (
              <span className="btn-loading"><span className="spinner" />Creating account…</span>
            ) : (
              'Create account'
            )}
          </button>
        </form>

        <p className="login-footer">
          Already have an account?{' '}
          <Link href="/login" id="signup-login-link" className="link">
            Sign in
          </Link>
        </p>
      </div>

      <AuthStyles />
    </div>
  );
}
