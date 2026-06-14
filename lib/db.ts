/**
 * Azure Cosmos DB (NoSQL/Core API) access layer.
 *
 * A single shared CosmosClient per server process, authenticated with Microsoft
 * Entra (AAD) — no account keys. In Azure the container's user-assigned managed
 * identity is selected via AZURE_CLIENT_ID; locally DefaultAzureCredential falls
 * back to the Azure CLI login. The account has local auth disabled, so AAD is
 * the only path.
 *
 * The database and its containers are provisioned out-of-band (control plane),
 * so there is no schema bootstrap here — the app only reads/writes items.
 *
 * Server-only: never import this from a client component.
 */
import 'server-only';
import { type Container, CosmosClient, type Database } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';

/** Logical container names within the database. */
export const CONTAINERS = {
  users: 'users',
  sessions: 'sessions',
  blocks: 'blocks',
} as const;

let client: CosmosClient | null = null;
let database: Database | null = null;

export function getCosmosEndpoint(): string | null {
  const v = process.env.COSMOS_ENDPOINT;
  return v && v.trim() ? v.trim() : null;
}

function getDatabaseName(): string {
  return process.env.COSMOS_DATABASE?.trim() || 'cca';
}

/** Thrown when the server has no Cosmos endpoint configured. */
export class DbNotConfiguredError extends Error {
  constructor() {
    super('COSMOS_ENDPOINT is not configured on the server.');
    this.name = 'DbNotConfiguredError';
  }
}

function getDatabase(): Database {
  const endpoint = getCosmosEndpoint();
  if (!endpoint) throw new DbNotConfiguredError();
  if (!database) {
    // AZURE_CLIENT_ID (when set) pins DefaultAzureCredential to the app's
    // user-assigned managed identity; otherwise it uses the local az login.
    client = new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
    database = client.database(getDatabaseName());
  }
  return database;
}

/** Returns a container client by logical name. */
export function getContainer(name: (typeof CONTAINERS)[keyof typeof CONTAINERS]): Container {
  return getDatabase().container(name);
}

/** True if a thrown Cosmos error is a 404 (not found). */
export function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 404;
}

/** True if a thrown Cosmos error is a 409 (conflict / already exists). */
export function isConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 409;
}
