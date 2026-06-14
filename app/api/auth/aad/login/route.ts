import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getAuthCodeUrl, getEntraConfig } from '@/lib/entra';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const STATE_COOKIE = 'aad_state';
export const NEXT_COOKIE = 'aad_next';

/** Starts the Microsoft Entra login: sets a CSRF state cookie and redirects. */
export async function GET(req: NextRequest) {
  const cfg = getEntraConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'Microsoft sign-in is not configured on the server.', code: 'AAD_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  // Only keep a same-origin relative path as the post-login destination.
  const requested = req.nextUrl.searchParams.get('next') || '/profile';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/profile';

  const state = randomBytes(16).toString('hex');
  const url = await getAuthCodeUrl(cfg, state);

  const res = NextResponse.redirect(url);
  const secure = process.env.NODE_ENV === 'production';
  const opts = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: 600 };
  res.cookies.set(STATE_COOKIE, state, opts);
  res.cookies.set(NEXT_COOKIE, next, opts);
  return res;
}
