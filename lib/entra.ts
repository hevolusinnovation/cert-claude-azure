/**
 * Microsoft Entra ID (Azure AD) OpenID Connect login for the Hevolus tenant.
 *
 * Uses MSAL Node as a confidential client (authorization-code flow with a
 * client secret). Single-tenant: only accounts from the configured tenant can
 * sign in — the authority is the tenant-specific endpoint, so the platform
 * rejects everyone else before they reach the app.
 *
 * The resulting identity is bridged onto the app's existing cookie session:
 * the Entra object id (`oid`, itself a GUID) becomes the app `users.id`, so
 * exam sessions stay scoped per real person with no schema change.
 *
 * Server-only.
 */
import 'server-only';
import { ConfidentialClientApplication, type Configuration } from '@azure/msal-node';

/** OIDC scopes — openid/profile/email give us the id-token claims we need
 * (oid, preferred_username, name) with no extra Microsoft Graph consent. */
export const AAD_SCOPES = ['openid', 'profile', 'email'];

export interface EntraConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Reads and validates the Entra config from the environment. */
export function getEntraConfig(): EntraConfig | null {
  // ENTRA_* (not AZURE_*) so these never collide with the AZURE_CLIENT_ID that
  // @azure/identity uses to pick the Cosmos managed identity.
  const tenantId = process.env.ENTRA_TENANT_ID?.trim();
  const clientId = process.env.ENTRA_CLIENT_ID?.trim();
  const clientSecret = process.env.ENTRA_CLIENT_SECRET?.trim();
  const redirectUri = process.env.AAD_REDIRECT_URI?.trim();
  if (!tenantId || !clientId || !clientSecret || !redirectUri) return null;
  return { tenantId, clientId, clientSecret, redirectUri };
}

/**
 * The app's public origin (scheme + host), derived from the configured redirect
 * URI. Behind the Container Apps ingress the request host is the internal
 * 0.0.0.0:3000, so we must not build self-redirects from req.nextUrl.origin.
 */
export function getAppBaseUrl(cfg: EntraConfig): string {
  return new URL(cfg.redirectUri).origin;
}

let cca: ConfidentialClientApplication | null = null;

function getClient(cfg: EntraConfig): ConfidentialClientApplication {
  if (!cca) {
    const config: Configuration = {
      auth: {
        clientId: cfg.clientId,
        authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
        clientSecret: cfg.clientSecret,
      },
    };
    cca = new ConfidentialClientApplication(config);
  }
  return cca;
}

/** Builds the Entra authorize URL to redirect the browser to. */
export async function getAuthCodeUrl(cfg: EntraConfig, state: string): Promise<string> {
  return getClient(cfg).getAuthCodeUrl({
    scopes: AAD_SCOPES,
    redirectUri: cfg.redirectUri,
    state,
    // Tenant-restricted login — never show the "use another account" home realm.
    prompt: 'select_account',
  });
}

export interface EntraIdentity {
  /** Entra object id (GUID) — stable per user within the tenant. */
  oid: string;
  /** UPN / email, used as the human-readable app username. */
  username: string;
  /** Display name, if present. */
  name: string | null;
}

/** Exchanges the authorization code for tokens and extracts the identity. */
export async function acquireIdentity(cfg: EntraConfig, code: string): Promise<EntraIdentity> {
  const result = await getClient(cfg).acquireTokenByCode({
    code,
    scopes: AAD_SCOPES,
    redirectUri: cfg.redirectUri,
  });

  const claims = (result.idTokenClaims ?? {}) as Record<string, unknown>;
  const oid = typeof claims.oid === 'string' ? claims.oid : result.uniqueId;
  if (!oid) throw new Error('Entra response is missing the object id (oid) claim.');

  const username =
    (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
    (typeof claims.email === 'string' && claims.email) ||
    result.account?.username ||
    oid;
  const name =
    (typeof claims.name === 'string' && claims.name) || result.account?.name || null;

  return { oid, username, name };
}
