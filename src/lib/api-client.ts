let redirecting = false;

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options, cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error('Could not confirm the request. Check the connection and retry the same form; do not create another copy of an uncertain save.');
  }
  if (response.status === 401 && typeof window !== 'undefined' && !redirecting) {
    redirecting = true;
    const next = window.location.pathname + window.location.search;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
  }
  return response;
}

export async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(url, options);
  const data = await response.json().catch(() => {
    throw new Error('The server returned an unreadable response. Retry the same form; do not create another copy of an uncertain save.');
  });
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}). Please retry.`);
  return data as T;
}

export function jsonRequest(method: string, body: object): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
