import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Password registration is retired in favor of Microsoft Entra sign-in.
export async function POST() {
  return json(
    { error: 'Password registration is disabled. Sign in with Microsoft.', code: 'GONE' },
    410,
  );
}
