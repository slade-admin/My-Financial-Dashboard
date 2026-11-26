'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, apiJson, jsonRequest } from '@/lib/api-client';
import LogoutButton from '@/components/LogoutButton';

interface Profile {
  email: string;
  full_name: string;
  phone_number: string | null;
  country: string;
  dob: string | null;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    try {
      const { user } = await apiJson<{ user: Profile }>('/api/profile');
      setProfile(user); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load your profile.'); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return (
    <main className="min-h-screen bg-[#0A0D14] p-5 text-slate-100">
      <div className="mx-auto max-w-xl space-y-6">
        <nav className="flex flex-wrap items-center gap-5 text-sm text-emerald-400" aria-label="Settings navigation">
          <Link href="/">Dashboard</Link><Link href="/settings/ingest">SMS tokens</Link><LogoutButton />
        </nav>
        <h1 className="text-2xl font-bold">Settings & Profile</h1>
        {error && <div role="alert" className="rounded-xl border border-rose-800 p-3 text-sm text-rose-300">
          {error} <button type="button" onClick={() => { void load(); }} className="ml-2 underline">Reload profile</button>
        </div>}
        {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
        {!profile ? <p>{error ? 'Profile unavailable.' : 'Loading profile...'}</p> : (
          <form className="space-y-4 rounded-2xl border border-slate-800 bg-[#111726] p-6" onSubmit={async (event) => {
            event.preventDefault();
            if (saving) return;
            setSaving(true); setError(''); setNotice('');
            try {
              const { user } = await apiJson<{ user: Profile }>('/api/profile', jsonRequest('PUT', {
                full_name: profile.full_name, phone_number: profile.phone_number || '',
                country: profile.country, dob: profile.dob || '',
              }));
              setProfile(user); setNotice('Profile saved.');
            } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save your profile.'); }
            finally { setSaving(false); }
          }}>
            <label className="block text-sm">Email (sign-in identifier)
              <input type="email" disabled value={profile.email} className="mt-1 w-full rounded-lg bg-slate-900 p-2 text-slate-400" />
            </label>
            <label className="block text-sm">Full name
              <input required maxLength={255} value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2" />
            </label>
            <label className="block text-sm">Phone number (optional)
              <input type="tel" maxLength={30} value={profile.phone_number || ''} onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2" />
            </label>
            <label className="block text-sm">Country code
              <input required maxLength={2} pattern="[A-Za-z]{2}" title="Two-letter country code, for example KE" value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2" />
            </label>
            <label className="block text-sm">Date of birth (optional)
              <input type="date" value={profile.dob?.slice(0, 10) || ''} onChange={(e) => setProfile({ ...profile, dob: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2" />
            </label>
            <button disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm disabled:opacity-50">
              {saving ? 'Saving...' : 'Save profile'}
            </button>
          </form>
        )}
        <section className="space-y-3 rounded-2xl border border-slate-800 bg-[#111726] p-6">
          <h2 className="text-lg font-semibold">Data protection & recovery</h2>
          <p className="text-sm text-slate-400">Export all your financial records, including reversed entries and retained history. The JSON file is private and unencrypted: save it outside shared or synced folders. It excludes sign-in secrets and is not a database backup.</p>
          <button type="button" disabled={exporting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm disabled:opacity-50" onClick={async () => {
            if (exporting) return;
            setExporting(true); setError(''); setNotice('');
            try {
              const response = await apiFetch('/api/export');
              if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Export failed. Retry.');
              }
              const url = URL.createObjectURL(await response.blob());
              const link = document.createElement('a');
              link.href = url;
              link.download = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'finance-export.json';
              document.body.append(link); link.click(); link.remove();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              setNotice('Export downloaded. Keep it private; use encrypted PostgreSQL backups for full recovery.');
            } catch (reason) { setError(reason instanceof Error ? reason.message : 'Export failed. Retry.'); }
            finally { setExporting(false); }
          }}>{exporting ? 'Preparing export...' : 'Download financial data (JSON)'}</button>
          <p className="text-xs text-slate-400">Encrypted backups and restore drills run locally from the terminal. See ENV_SETUP.md for daily scheduling and owner password recovery. A reset revokes existing browser sessions and SMS tokens.</p>
        </section>
      </div>
    </main>
  );
}
