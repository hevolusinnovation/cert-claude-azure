import { Suspense } from 'react';
import ExamRunner from '@/components/ExamRunner';

export default function ExamPage() {
  return (
    <Suspense
      fallback={
        <main className="container">
          <p className="muted">Loading…</p>
        </main>
      }
    >
      <ExamRunner />
    </Suspense>
  );
}
