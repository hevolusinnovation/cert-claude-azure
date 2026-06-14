import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Self-service registration is disabled: accounts come from Microsoft Entra
// (the Hevolus tenant). Any visit here is sent to the single sign-in entry.
export default function RegisterPage() {
  redirect('/login');
}
