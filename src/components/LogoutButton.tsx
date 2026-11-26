'use client';

import { useState } from 'react';
import { apiJson } from '@/lib/api-client';

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="text-xs">
      <button type="button" disabled={busy} className="text-slate-300 hover:text-white disabled:opacity-50" onClick={async () => {
        setBusy(true); setError('');
        try {
          await apiJson('/api/auth/logout', { method: 'POST' });
          window.location.replace('/login');
        } catch {
          setError('Logout failed. Retry.'); setBusy(false);
        }
      }}>{busy ? 'Signing out...' : 'Log out'}</button>
      {error && <span role="alert" className="ml-2 text-rose-300">{error}</span>}
    </div>
  );
}
