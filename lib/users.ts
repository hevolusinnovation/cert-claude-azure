/** User persistence (Cosmos DB). Server-only. */
import 'server-only';
import { CONTAINERS, getContainer, isNotFound } from './db';
import type { User } from './types';

interface UserDoc {
  id: string;
  username: string;
}

/**
 * Creates or updates a user from a Microsoft Entra identity. Keyed by the Entra
 * object id (a GUID), which doubles as the app user id and the partition key.
 * The username (UPN / email) is refreshed on every login. There is no password:
 * sign-in only ever happens through Entra.
 */
export async function upsertEntraUser(oid: string, username: string): Promise<User> {
  const { resource } = await getContainer(CONTAINERS.users).items.upsert<UserDoc>({
    id: oid,
    username,
  });
  return { id: resource!.id, username: resource!.username };
}

export async function findUserById(id: string): Promise<User | null> {
  try {
    const { resource } = await getContainer(CONTAINERS.users).item(id, id).read<UserDoc>();
    return resource ? { id: resource.id, username: resource.username } : null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}
