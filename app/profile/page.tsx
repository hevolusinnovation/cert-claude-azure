import { redirect } from 'next/navigation';
import ProfileView from '@/components/ProfileView';
import { currentUserId } from '@/lib/auth';
import { getUserStats, listSessions } from '@/lib/sessions';
import { findUserById } from '@/lib/users';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const uid = await currentUserId();
  if (!uid) redirect('/login?next=/profile');
  const user = await findUserById(uid);
  if (!user) redirect('/login?next=/profile');

  const [sessions, stats] = await Promise.all([listSessions(uid), getUserStats(uid)]);

  return <ProfileView username={user.username} sessions={sessions} stats={stats} />;
}
