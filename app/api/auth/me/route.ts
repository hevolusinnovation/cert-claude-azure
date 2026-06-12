import { currentUserId } from '@/lib/auth';
import { errorResponse, json } from '@/lib/http';
import { findUserById } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const uid = await currentUserId();
    if (!uid) return json({ user: null });
    const user = await findUserById(uid);
    return json({ user });
  } catch (err) {
    return errorResponse(err);
  }
}
