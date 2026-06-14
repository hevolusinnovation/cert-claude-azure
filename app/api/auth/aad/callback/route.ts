import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { startSession } from '@/lib/auth';
import { acquireIdentity, getAppBaseUrl, getEntraConfig } from '@/lib/entra';
import { upsertEntraUser } from '@/lib/users';
import { NEXT_COOKIE, STATE_COOKIE } from '../login/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Resolves an absolute, same-site URL against the app's public origin. Behind
 * the Container Apps ingress the request host is the internal 0.0.0.0:3000, so
 * self-redirects must be built from the configured origin, not req.nextUrl.
 */
function siteUrl(base: string, path: string): URL {
  return new URL(path, base);
}

/** Entra redirects here with ?code & ?state after the user authenticates. */
export async function GET(req: NextRequest) {
  const cfg = getEntraConfig();
  if (!cfg) return NextResponse.redirect(new URL('/login?error=not_configured', req.nextUrl.origin));

  const base = getAppBaseUrl(cfg);
  const fail = (code: string) => NextResponse.redirect(siteUrl(base, `/login?error=${code}`));

  const params = req.nextUrl.searchParams;
  if (params.get('error')) return fail(params.get('error') || 'aad_error');

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return fail('missing_code');

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  const next = store.get(NEXT_COOKIE)?.value || '/profile';
  // One-time use: clear the CSRF cookies regardless of outcome.
  store.delete(STATE_COOKIE);
  store.delete(NEXT_COOKIE);
  if (!expectedState || expectedState !== state) return fail('bad_state');

  try {
    const identity = await acquireIdentity(cfg, code);
    const user = await upsertEntraUser(identity.oid, identity.username);
    await startSession(user.id);
  } catch (err) {
    console.error('[auth/aad] callback failed', err);
    return fail('exchange_failed');
  }

  const dest = next.startsWith('/') && !next.startsWith('//') ? next : '/profile';
  return NextResponse.redirect(siteUrl(base, dest));
}
