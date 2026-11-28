import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8081",
  realm: import.meta.env.VITE_KEYCLOAK_REALM || "project-raph-oilhan",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "project-web",
});

let initialization: Promise<boolean> | undefined;

function appRedirectUri() {
  return new URL("/", window.location.origin).toString();
}

export function initializeAuth(): Promise<boolean> {
  if (!initialization) {
    initialization = keycloak.init({
      onLoad: "check-sso",
      pkceMethod: "S256",
      silentCheckSsoRedirectUri: new URL(
        "/silent-check-sso.html",
        window.location.origin,
      ).toString(),
    }).catch((error: unknown) => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

export async function login(): Promise<void> {
  await initializeAuth();
  await keycloak.login({ redirectUri: appRedirectUri() });
}

export async function register(): Promise<void> {
  await initializeAuth();
  await keycloak.register({ redirectUri: appRedirectUri() });
}

export async function logout(): Promise<void> {
  if (!keycloak.authenticated) return;
  await keycloak.logout({ redirectUri: appRedirectUri() });
}

export async function accessToken(): Promise<string | undefined> {
  // Keep public API requests anonymous while the initial SSO check is pending.
  if (!keycloak.authenticated) return undefined;
  await keycloak.updateToken(30);
  return keycloak.token;
}

export function currentEmail(): string {
  const email = keycloak.tokenParsed?.email;
  return typeof email === "string" ? email : "";
}

export function hasRole(role: "user" | "admin"): boolean {
  return keycloak.hasRealmRole(role);
}
