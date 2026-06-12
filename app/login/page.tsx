import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { currentUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await currentUserId()) redirect('/profile');
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
