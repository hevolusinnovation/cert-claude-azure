import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: 'Microsoft sign-in is not configured. Contact the administrator.',
  missing_code: 'Sign-in was interrupted. Please try again.',
  bad_state: 'Your sign-in session expired. Please try again.',
  exchange_failed: 'Could not complete sign-in. Please try again.',
  access_denied: 'Access was denied. You need a Hevolus account to sign in.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (await currentUserId()) redirect('/profile');

  const { next, error } = await searchParams;
  const loginHref = next
    ? `/api/auth/aad/login?next=${encodeURIComponent(next)}`
    : '/api/auth/aad/login';
  const errorMsg = error ? (ERROR_MESSAGES[error] ?? 'Sign-in failed. Please try again.') : null;

  return (
    <main className="container narrow">
      <div className="card auth-card">
        <span className="pill-tag">Hevolus</span>
        <h1 className="serif">Sign in</h1>
        <p className="muted">
          Sign in with your Hevolus Microsoft account to save your exams, resume them later, and
          track your stats.
        </p>

        {errorMsg && <p className="auth-error">{errorMsg}</p>}

        <Link className="btn" href={loginHref}>
          Sign in with Microsoft
        </Link>

        <p className="muted small auth-switch">
          Only accounts from the Hevolus tenant can access this app.
        </p>
      </div>
    </main>
  );
}
