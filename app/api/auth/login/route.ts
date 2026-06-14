import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Password login is retired in favor of Microsoft Entra sign-in
// (GET /api/auth/aad/login).
export async function POST() {
  return json(
    { error: 'Password login is disabled. Sign in with Microsoft.', code: 'GONE' },
    410,
  );
}
