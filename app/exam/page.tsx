import { Suspense } from 'react';
import ExamRunner from '@/components/ExamRunner';

export default async function ExamPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  return (
    <Suspense
      fallback={
        <main className="container">
          <p className="muted">Loading…</p>
        </main>
      }
    >
      {/* Key on the session id so switching exams (a query-only change, which
          the App Router would otherwise reuse the same component for) forces a
          clean remount — no stale state from the previous session leaks in. */}
      <ExamRunner key={session ?? 'none'} />
    </Suspense>
  );
}
