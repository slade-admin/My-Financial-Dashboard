'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import type { HistoryEntry } from '@/lib/repo/types';

export interface HistorySelection { kind: string; id: string | number; name: string }

const hidden = new Set(['id', 'user_id', 'version', 'updated_at', 'created_at', 'source_fingerprint']);
function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(none)';
  return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
}

export default function HistoryDialog({ selection, onClose }: { selection: HistorySelection; onClose: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ entity: selection.kind, id: String(selection.id), page: String(page) });
      const data = await apiJson<{ entries: HistoryEntry[]; hasMore: boolean }>(`/api/history?${params}`, { signal });
      if (!signal?.aborted) { setEntries(data.entries); setHasMore(data.hasMore); }
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Could not load history.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [selection.kind, selection.id, page]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(controller.signal); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-[#111726] p-6">
        <div className="flex justify-between gap-4"><h2 id="history-title" className="font-bold">History: {selection.name}</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-400">Close</button>
        </div>
        {error ? <div role="alert" className="text-sm text-rose-300">{error} <button type="button" className="underline" onClick={() => { void load(); }}>Retry</button></div>
          : loading ? <p className="text-sm text-slate-400">Loading history...</p>
            : entries.length === 0 ? <p className="text-sm text-slate-400">No changes recorded since edit history was enabled. The first edit will retain the prior values.</p>
              : entries.map((entry) => (
                <article key={entry.id} className="space-y-2 rounded-xl border border-slate-800 p-3 text-xs">
                  <p className="text-slate-400">{new Date(entry.created_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} EAT | {entry.action}</p>
                  <p className="font-semibold">{entry.reason}</p>
                  <dl className="space-y-1">
                    {Object.entries(entry.after).filter(([key, value]) => !hidden.has(key) &&
                      (!entry.before || JSON.stringify(entry.before[key]) !== JSON.stringify(value))).map(([key, value]) => (
                      <div key={key} className="grid grid-cols-3 gap-2 break-words">
                        <dt className="text-slate-400">{key.replaceAll('_', ' ')}</dt>
                        <dd className="text-slate-500">{entry.before ? display(entry.before[key]) : '(new)'}</dd>
                        <dd className="text-emerald-300">{display(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
        <div className="flex items-center justify-between text-xs">
          <button type="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)} className="disabled:opacity-40">Newer</button>
          <span>Page {page + 1}</span>
          <button type="button" disabled={!hasMore || loading} onClick={() => setPage(page + 1)} className="disabled:opacity-40">Older</button>
        </div>
      </div>
    </div>
  );
}
