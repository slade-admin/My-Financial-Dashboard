/**
 * /settings/ingest — manage SMS ingest tokens.
 *
 * These are the bearer tokens the phone-side forwarder uses to POST to
 * /api/ingest/sms. Until now they could only be created with curl, which is
 * not a realistic setup path.
 *
 * A created token is shown exactly once. The server stores only an argon2id
 * hash of its secret half, so it genuinely cannot be shown again — the UI
 * says so plainly rather than implying it can be looked up later.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthStyles from '@/app/_components/AuthStyles';

interface TokenRow {
  id: number;
  label: string | null;
  last_used_at: string | null;
  created_at: string;
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString();
}

export default function IngestTokensPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [label, setLabel] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Deliberately performs no synchronous state update before its first await:
  // this runs from an effect on mount, and writing state synchronously inside
  // an effect is what react-hooks/set-state-in-effect warns about. Clearing
  // the previous error happens once the request is already in flight.
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ingest-tokens');
      setError('');
      if (res.status === 401) {
        router.replace('/login?next=/settings/ingest');
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load tokens');
      setTokens(data.tokens ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // react-hooks/set-state-in-effect flags any effect that reaches a
    // setState, which is unavoidable for fetch-on-mount in a Client
    // Component — the state only lands after the request resolves, never
    // synchronously during the effect. The rule-satisfying alternative is to
    // make this a Server Component that loads the tokens and passes them to a
    // smaller client island for the create/revoke actions. That is the better
    // long-term shape and worth doing when this page grows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);
    setCopied(false);
    try {
      const res = await fetch('/api/ingest-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create token');
      setFresh(data.token);
      setLabel('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create token');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: number, tokenLabel: string | null) {
    if (!window.confirm(
      `Revoke "${tokenLabel ?? `token #${id}`}"?\n\n` +
      'Any phone using it will stop syncing immediately. This cannot be undone.',
    )) return;
    setError('');
    try {
      const res = await fetch(`/api/ingest-tokens?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to revoke token');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke token');
    }
  }

  return (
    <div className="ingest-page">
      <div className="ingest-card">
        <header className="ingest-header">
          <h1 className="ingest-title">SMS sync tokens</h1>
          <p className="ingest-sub">
            Your phone uses one of these to forward M-Pesa and bank SMS to Track-suite,
            so transactions appear without copy-pasting.
          </p>
        </header>

        {error && <div className="form-error" role="alert"><span>⚠️</span> {error}</div>}

        {fresh && (
          <div className="token-reveal" role="status">
            <strong>Copy this now — it is shown only once.</strong>
            <p className="token-reveal-note">
              Only a hash of it is stored, so it cannot be displayed again. If you lose
              it, revoke it and create another.
            </p>
            <code className="token-value">{fresh}</code>
            <div className="token-actions">
              <button
                type="button"
                className="btn-small"
                onClick={async () => {
                  await navigator.clipboard.writeText(fresh);
                  setCopied(true);
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" className="btn-small ghost" onClick={() => { setFresh(null); setCopied(false); }}>
                Done
              </button>
            </div>
          </div>
        )}

        <form onSubmit={createToken} className="create-row">
          <input
            type="text"
            className="form-input"
            placeholder="Label, e.g. Kevin's phone"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={100}
            aria-label="Token label"
          />
          <button type="submit" className="btn-primary compact" disabled={creating}>
            {creating ? 'Creating…' : 'Create token'}
          </button>
        </form>

        <h2 className="section-title">Active tokens</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="muted">No tokens yet. Create one, then set up your phone below.</p>
        ) : (
          <table className="token-table">
            <thead>
              <tr><th>Label</th><th>Created</th><th>Last used</th><th /></tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.label ?? <span className="muted">untitled</span>}</td>
                  <td>{formatWhen(t.created_at)}</td>
                  <td>
                    {t.last_used_at
                      ? formatWhen(t.last_used_at)
                      : <span className="muted">never — phone not set up yet</span>}
                  </td>
                  <td><button type="button" className="btn-small danger" onClick={() => revoke(t.id, t.label)}>Revoke</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className="section-title">Set up your phone</h2>
        <ol className="setup-steps">
          <li>Install an SMS automation app — <strong>MacroDroid</strong> or <strong>Tasker</strong> on Android.</li>
          <li>Add a trigger for <em>SMS received</em>, from senders <code>MPESA</code> and your bank.</li>
          <li>
            Add an <em>HTTP POST</em> action to:
            <code className="endpoint">POST {typeof window !== 'undefined' ? window.location.origin : ''}/api/ingest/sms</code>
          </li>
          <li>
            Set header <code>Authorization: Bearer &lt;your token&gt;</code> and
            content type <code>application/json</code>.
          </li>
          <li>
            Body: <code>{'{"message": "[sms_message]", "sender": "[sms_sender]"}'}</code>
            {' '}— use your app&apos;s variable names for the message text and sender.
          </li>
        </ol>
        <p className="muted small">
          Re-sending the same SMS is harmless: messages are de-duplicated on the M-Pesa
          receipt number, so a retrying forwarder cannot double-count a transaction.
        </p>
      </div>

      <AuthStyles />
      <style>{`
        .ingest-page {
          min-height: 100vh; padding: 2rem 1rem;
          background:
            radial-gradient(ellipse at 20% 0%, rgba(99,102,241,0.12) 0%, transparent 50%),
            #0a0f1e;
          display: flex; justify-content: center;
        }
        .ingest-card {
          width: 100%; max-width: 760px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px; padding: 2rem;
          backdrop-filter: blur(20px);
        }
        .ingest-header { margin-bottom: 1.5rem; }
        .ingest-title {
          margin: 0 0 .35rem; font-size: 1.4rem; font-weight: 650;
          color: rgba(255,255,255,0.95);
        }
        .ingest-sub { margin: 0; font-size: .875rem; color: rgba(255,255,255,0.5); line-height: 1.5; }
        .section-title {
          margin: 2rem 0 .75rem; font-size: .95rem; font-weight: 600;
          color: rgba(255,255,255,0.8);
        }
        .create-row { display: flex; gap: .75rem; margin-top: 1.25rem; }
        .create-row .form-input { flex: 1; }
        .btn-primary.compact { margin-top: 0; white-space: nowrap; padding: .75rem 1.1rem; }
        .token-reveal {
          margin: 1.25rem 0; padding: 1rem;
          background: rgba(16,185,129,0.10);
          border: 1px solid rgba(16,185,129,0.35);
          border-radius: 12px; color: #a7f3d0; font-size: .85rem;
        }
        .token-reveal-note { margin: .4rem 0 .75rem; color: rgba(167,243,208,0.75); font-size: .78rem; }
        .token-value {
          display: block; padding: .65rem .8rem; margin-bottom: .75rem;
          background: rgba(0,0,0,0.45); border-radius: 8px;
          font-family: ui-monospace, monospace; font-size: .78rem;
          color: #fff; word-break: break-all; user-select: all;
        }
        .token-actions { display: flex; gap: .5rem; }
        .token-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
        .token-table th {
          text-align: left; padding: .5rem .6rem; font-weight: 500;
          color: rgba(255,255,255,0.45); border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .token-table td {
          padding: .65rem .6rem; color: rgba(255,255,255,0.85);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .btn-small {
          padding: .4rem .7rem; border-radius: 8px; cursor: pointer;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.08); color: #fff; font-size: .78rem;
        }
        .btn-small:hover { background: rgba(255,255,255,0.14); }
        .btn-small.ghost { background: transparent; }
        .btn-small.danger { border-color: rgba(239,68,68,0.35); color: #fca5a5; }
        .btn-small.danger:hover { background: rgba(239,68,68,0.15); }
        .muted { color: rgba(255,255,255,0.4); }
        .small { font-size: .78rem; }
        .setup-steps { margin: 0; padding-left: 1.2rem; color: rgba(255,255,255,0.75); font-size: .85rem; line-height: 1.9; }
        .setup-steps code {
          background: rgba(0,0,0,0.4); padding: .12rem .4rem; border-radius: 5px;
          font-family: ui-monospace, monospace; font-size: .78rem; color: #c7d2fe;
        }
        .setup-steps code.endpoint { display: block; margin-top: .35rem; padding: .5rem .7rem; word-break: break-all; }
      `}</style>
    </div>
  );
}
