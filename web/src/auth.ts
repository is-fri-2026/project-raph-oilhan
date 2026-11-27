/**
 * auth.ts — Gestion de l'authentification Keycloak côté frontend.
 *
 * Stratégie : Resource Owner Password Credentials Grant (ROPC).
 * L'utilisateur saisit ses identifiants dans notre propre formulaire React ;
 * le navigateur n'est jamais redirigé vers la page de connexion Keycloak.
 * Les tokens sont gardés en mémoire (jamais en localStorage ni en cookie)
 * pour limiter la surface d'attaque XSS.
 *
 * Fonctionnement :
 *  1. login(email, password) → POST /token avec grant_type=password
 *  2. Le token est stocké dans la closure du module (mémoire seule)
 *  3. accessToken() renouvelle le token avant expiration via refresh_token
 *  4. logout() révoque le refresh_token et vide la mémoire
 */

const KEYCLOAK_URL =
  import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8081";
const REALM =
  import.meta.env.VITE_KEYCLOAK_REALM || "project-raph-oilhan";
const CLIENT_ID =
  import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "project-web";

const TOKEN_URL = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`;
const LOGOUT_URL = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/logout`;

// ── Types ────────────────────────────────────────────────────────────────────

interface TokenSet {
  access_token: string;
  refresh_token: string;
  /** Timestamp (ms) at which the access_token expires */
  expiresAt: number;
  email: string;
  roles: string[];
}

// ── Module-level state (never written to localStorage) ───────────────────────

let session: TokenSet | undefined;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseJwt(token: string): Record<string, unknown> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractSession(data: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): TokenSet {
  const claims = parseJwt(data.access_token);
  const roles = (
    (claims.realm_access as { roles?: unknown[] } | undefined)?.roles ?? []
  ).filter((r): r is string => typeof r === "string");
  const email =
    typeof claims.email === "string"
      ? claims.email
      : typeof claims.preferred_username === "string"
        ? claims.preferred_username
        : "";
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    // Renew 30 s before expiry to avoid 401s mid-request
    expiresAt: Date.now() + (data.expires_in - 30) * 1000,
    email,
    roles,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Authenticates the user against Keycloak using the ROPC grant.
 * Throws a human-readable error on failure.
 */
export async function login(email: string, password: string): Promise<void> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "password",
    username: email,
    password,
    scope: "openid profile email",
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error_description?: string;
      error?: string;
    };
    // Translate the most common Keycloak error codes into friendly messages
    if (payload.error === "invalid_grant") {
      throw new Error("Invalid email or password.");
    }
    throw new Error(payload.error_description ?? "Authentication failed.");
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  session = extractSession(data);
}

/**
 * Clears the session and revokes the refresh token with Keycloak.
 */
export async function logout(): Promise<void> {
  if (!session) return;
  const refreshToken = session.refresh_token;
  session = undefined;

  // Best-effort revocation — ignore errors (network might be down)
  try {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    });
    await fetch(LOGOUT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    // Ignore
  }
}

/**
 * Returns a valid access token, refreshing it if it is about to expire.
 * Returns undefined when the user is not authenticated.
 */
export async function accessToken(): Promise<string | undefined> {
  if (!session) return undefined;

  if (Date.now() < session.expiresAt) {
    // Token is still valid
    return session.access_token;
  }

  // Refresh the token
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: session.refresh_token,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    // Refresh token expired — the user must log in again
    session = undefined;
    return undefined;
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  session = extractSession(data);
  return session.access_token;
}

/** Whether there is an active session. */
export function isAuthenticated(): boolean {
  return session !== undefined;
}

/** Email of the currently authenticated user (or empty string). */
export function currentEmail(): string {
  return session?.email ?? "";
}

/** True when the authenticated user has the given realm role. */
export function hasRole(role: "admin" | "user"): boolean {
  return session?.roles.includes(role) ?? false;
}
