/**
 * src/proxy.ts — Auth guard (Next.js 16 proxy, formerly middleware)
 *
 * Protected paths:
 *   - All /api/* routes EXCEPT /api/auth/* (login, signup, logout, me)
 *   - All pages EXCEPT /login and /signup
 *
 * Session validation is intentionally lightweight here — only checks that the
 * cookie is present (we can't run argon2id in proxy). Full session validation
 * happens inside each Route Handler / Server Component via currentUserId().
 *
 * NOTE from Next.js 16 docs:
 *   "Always verify authentication and authorization inside each Server Function
 *    rather than relying on Proxy alone."
 * This proxy provides redirect-on-visit UX only. The repo layer enforces the
 * real security boundary.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

// Public API endpoints — do NOT require session cookie
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/me',
];

// Public pages
const PUBLIC_PAGES = ['/login', '/signup'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  // ── API routes ────────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const isPublic = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
    if (!isPublic && !hasSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Page routes ───────────────────────────────────────────────────────────
  const isPublicPage = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  // Already authenticated → redirect away from login/signup
  if (hasSession && isPublicPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Not authenticated → redirect to login
  if (!hasSession && !isPublicPage) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (Next.js static assets)
     * - _next/image  (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml
     * - public/ files (manifest.json, icons, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|icons/|manifest\\.json).*)',
  ],
};
