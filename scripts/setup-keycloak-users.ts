/**
 * Configure les clients OIDC puis, en local/CI, les utilisateurs de test Keycloak.
 * 
 * Ce script est conçu pour être exécuté en environnement local et en CI GitHub Actions.
 * Il configure de façon dynamique et reproductible les comptes nécessaires aux tests d'intégration Bruno :
 *   - 'user1' (email: user@example.com, rôle: user)
 *   - 'admin' (email: admin@example.com, rôle: admin)
 *
 * Principes de sécurité appliqués :
 * - Aucun mot de passe ni identifiant n'est codé en dur : ils sont lus depuis l'environnement.
 * - En local, des valeurs par défaut de développement sont utilisées si l'environnement n'est pas renseigné.
 * - Le realm-export.json du projet reste propre de toute donnée utilisateur ou clé privée.
 */

import "dotenv/config";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8081";
const REALM_NAME = process.env.KEYCLOAK_REALM || "project-raph-oilhan";
const configuredWebOrigin = new URL(process.env.WEB_ORIGIN || "http://localhost:5173");
if (
  configuredWebOrigin.pathname !== "/"
  || configuredWebOrigin.search
  || configuredWebOrigin.hash
  || (configuredWebOrigin.protocol !== "https:"
    && !["localhost", "127.0.0.1"].includes(configuredWebOrigin.hostname))
) {
  throw new Error("WEB_ORIGIN must be an exact HTTPS origin (HTTP is allowed only on localhost).");
}
const WEB_ORIGIN = configuredWebOrigin.origin;

// Identifiants administrateur Keycloak (bootstrap admin)
const KC_BOOTSTRAP_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME || "admin";
const KC_BOOTSTRAP_ADMIN_PASS = process.env.KEYCLOAK_ADMIN_PASSWORD;

// Utilisateurs de test à provisionner
const TEST_USER_USERNAME = process.env.KEYCLOAK_USER_USERNAME || "user1";
const TEST_USER_EMAIL = process.env.KEYCLOAK_USER_EMAIL || "user@example.com";
const TEST_USER_PASSWORD = process.env.KEYCLOAK_USER_PASSWORD;

const TEST_ADMIN_USERNAME = process.env.KEYCLOAK_APP_ADMIN_USERNAME || "admin";
const TEST_ADMIN_EMAIL = process.env.KEYCLOAK_APP_ADMIN_EMAIL || "admin@example.com";
const TEST_ADMIN_PASSWORD = process.env.KEYCLOAK_APP_ADMIN_PASSWORD;
const CLIENTS_ONLY = process.argv.includes("--clients-only");

if (
  !KC_BOOTSTRAP_ADMIN_PASS
  || (!CLIENTS_ONLY && (!TEST_USER_PASSWORD || !TEST_ADMIN_PASSWORD))
) {
  throw new Error(
    CLIENTS_ONLY
      ? "[setup-keycloak] KEYCLOAK_ADMIN_PASSWORD est requis."
      : "[setup-keycloak] Variables requises manquantes : veuillez définir KEYCLOAK_ADMIN_PASSWORD, KEYCLOAK_USER_PASSWORD et KEYCLOAK_APP_ADMIN_PASSWORD (dans le fichier .env en local ou via GitHub Secrets en CI).",
  );
}

interface KeycloakRole {
  id: string;
  name: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
}

interface KeycloakRealm {
  defaultRole?: KeycloakRole;
  [key: string]: unknown;
}

interface KeycloakProfileRequirement {
  roles?: string[];
  scopes?: string[];
  [key: string]: unknown;
}

interface KeycloakProfileAttribute {
  name: string;
  required?: KeycloakProfileRequirement | null;
  [key: string]: unknown;
}

interface KeycloakUserProfile {
  attributes?: KeycloakProfileAttribute[];
  [key: string]: unknown;
}

interface KeycloakClient {
  id: string;
  clientId: string;
  redirectUris?: string[];
  webOrigins?: string[];
  protocolMappers?: KeycloakProtocolMapper[];
  [key: string]: unknown;
}

interface KeycloakProtocolMapper {
  id?: string;
  name: string;
  protocol?: string;
  protocolMapper?: string;
  consentRequired?: boolean;
  config?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Attente active (polling) jusqu'à ce que Keycloak soit prêt à recevoir des requêtes.
 */
async function waitForKeycloak(maxRetries = 30, intervalMs = 2000): Promise<void> {
  console.log(`[setup-keycloak] En attente de Keycloak sur ${KEYCLOAK_URL} ...`);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${KEYCLOAK_URL}/realms/${REALM_NAME}/.well-known/openid-configuration`);
      if (response.ok) {
        console.log(`[setup-keycloak] Keycloak est disponible (tentative ${attempt}).`);
        return;
      }
    } catch {
      // Keycloak n'a pas encore ouvert son port ou le service démarre
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`[setup-keycloak] Keycloak n'a pas répondu après ${maxRetries * (intervalMs / 1000)}s.`);
}

/**
 * Récupère un jeton d'accès administrateur auprès du realm 'master' via l'admin-cli.
 */
async function getAdminToken(): Promise<string> {
  const tokenUrl = `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    client_id: "admin-cli",
    username: KC_BOOTSTRAP_ADMIN_USER,
    password: KC_BOOTSTRAP_ADMIN_PASS,
    grant_type: "password",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[setup-keycloak] Échec de l'authentification admin : ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Récupère la définition d'un rôle du Realm (id, nom, etc.).
 */
async function getRealmRole(token: string, roleName: string): Promise<KeycloakRole> {
  const url = `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/roles/${encodeURIComponent(roleName)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[setup-keycloak] Rôle '${roleName}' introuvable dans le realm '${REALM_NAME}' : ${errorText}`);
  }

  return (await response.json()) as KeycloakRole;
}

async function configureRegistrationProfile(token: string): Promise<void> {
  const profileUrl = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM_NAME)}/users/profile`;
  const profileResponse = await fetch(profileUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!profileResponse.ok) {
    throw new Error(`[setup-keycloak] Impossible de lire le profil utilisateur : ${await profileResponse.text()}`);
  }

  const profile = await profileResponse.json() as KeycloakUserProfile;
  if (!Array.isArray(profile.attributes)) {
    throw new Error("[setup-keycloak] La configuration du profil utilisateur ne contient pas d'attributs.");
  }

  const foundAttributes = new Set(profile.attributes.map((attribute) => attribute.name));
  for (const requiredAttribute of ["username", "email"]) {
    if (!foundAttributes.has(requiredAttribute)) {
      throw new Error(`[setup-keycloak] L'attribut '${requiredAttribute}' est absent du profil utilisateur.`);
    }
  }

  const attributes = profile.attributes.map((attribute) => {
    if (attribute.name === "username" || attribute.name === "email") {
      return {
        ...attribute,
        // Keycloak treats empty role/scope requirements as required in every context.
        required: {
          roles: [],
          scopes: [],
        },
      };
    }

    if (attribute.name === "firstName" || attribute.name === "lastName") {
      // An absent required policy makes these profile attributes optional.
      const { required: _required, ...optionalAttribute } = attribute;
      return optionalAttribute;
    }

    return attribute;
  });

  const updateResponse = await fetch(profileUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...profile, attributes }),
  });
  if (!updateResponse.ok) {
    throw new Error(`[setup-keycloak] Impossible de mettre à jour le profil utilisateur : ${await updateResponse.text()}`);
  }

  console.log("[setup-keycloak] Username et email requis; firstName et lastName facultatifs.");
}

async function configureSelfRegistration(token: string): Promise<void> {
  const realmUrl = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM_NAME)}`;
  const realmResponse = await fetch(realmUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!realmResponse.ok) {
    throw new Error(`[setup-keycloak] Impossible de lire le realm '${REALM_NAME}' : ${await realmResponse.text()}`);
  }

  const realm = await realmResponse.json() as KeycloakRealm;
  const updateRealmResponse = await fetch(realmUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...realm,
      registrationAllowed: true,
      registrationEmailAsUsername: false,
    }),
  });
  if (!updateRealmResponse.ok) {
    throw new Error(`[setup-keycloak] Impossible d'activer l'inscription libre : ${await updateRealmResponse.text()}`);
  }

  const defaultRoleName = realm.defaultRole?.name;
  if (!defaultRoleName) {
    throw new Error(`[setup-keycloak] Le rôle par défaut du realm '${REALM_NAME}' est introuvable.`);
  }
  const userRole = await getRealmRole(token, "user");
  const compositesUrl = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM_NAME)}`
    + `/roles/${encodeURIComponent(defaultRoleName)}/composites`;
  const compositesResponse = await fetch(compositesUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!compositesResponse.ok) {
    throw new Error(`[setup-keycloak] Impossible de lire les rôles par défaut : ${await compositesResponse.text()}`);
  }

  const currentRoles = await compositesResponse.json() as KeycloakRole[];
  if (!currentRoles.some((role) => role.id === userRole.id)) {
    const addRoleResponse = await fetch(compositesUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([userRole]),
    });
    if (!addRoleResponse.ok) {
      throw new Error(`[setup-keycloak] Impossible d'attribuer le rôle 'user' par défaut : ${await addRoleResponse.text()}`);
    }
  }
  await configureRegistrationProfile(token);
  console.log("[setup-keycloak] Inscription libre activée avec le rôle user par défaut.");
}

async function findClient(token: string, clientId: string): Promise<KeycloakClient | undefined> {
  const searchUrl = `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients?clientId=${encodeURIComponent(clientId)}`;
  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!searchResponse.ok) {
    throw new Error(`[setup-keycloak] Impossible de lire le client '${clientId}' : ${await searchResponse.text()}`);
  }

  const clients = (await searchResponse.json()) as KeycloakClient[];
  return clients.find((candidate) => candidate.clientId === clientId);
}

async function updateClient(
  token: string,
  client: KeycloakClient,
  updates: Partial<KeycloakClient>,
): Promise<void> {
  const updateResponse = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${client.id}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...client, ...updates }),
    },
  );
  if (!updateResponse.ok) {
    throw new Error(`[setup-keycloak] Impossible de mettre à jour le client '${client.clientId}' : ${await updateResponse.text()}`);
  }
}

function withApiAudienceMapper(mappers: KeycloakProtocolMapper[] = []) {
  const existing = mappers.find((mapper) => mapper.name === "project-api-audience");
  const mapper: KeycloakProtocolMapper = {
    ...(existing ?? {}),
    name: "project-api-audience",
    protocol: "openid-connect",
    protocolMapper: "oidc-audience-mapper",
    consentRequired: false,
    config: {
      ...(existing?.config ?? {}),
      "included.client.audience": "project-api",
      "id.token.claim": "false",
      "access.token.claim": "true",
      "introspection.token.claim": "true",
    },
  };
  return [...mappers.filter((candidate) => candidate.name !== mapper.name), mapper];
}

async function configureOidcClients(token: string): Promise<void> {
  const apiClient = await findClient(token, "project-api");
  if (!apiClient) {
    throw new Error(`[setup-keycloak] Client 'project-api' introuvable dans le realm '${REALM_NAME}'.`);
  }
  await updateClient(token, apiClient, {
    protocolMappers: withApiAudienceMapper(apiClient.protocolMappers),
  });

  const webClient = await findClient(token, "project-web");
  const webClientSettings: Omit<KeycloakClient, "id"> = {
    clientId: "project-web",
    name: "Project web SPA",
    rootUrl: WEB_ORIGIN,
    baseUrl: `${WEB_ORIGIN}/`,
    enabled: true,
    protocol: "openid-connect",
    publicClient: true,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    frontchannelLogout: true,
    redirectUris: [`${WEB_ORIGIN}/`, `${WEB_ORIGIN}/silent-check-sso.html`],
    webOrigins: [WEB_ORIGIN],
    attributes: {
      "pkce.code.challenge.method": "S256",
      "post.logout.redirect.uris": `${WEB_ORIGIN}/`,
    },
    fullScopeAllowed: true,
    defaultClientScopes: ["web-origins", "acr", "roles", "profile", "basic", "email"],
  };
  if (webClient) {
    await updateClient(token, webClient, {
      ...webClientSettings,
      protocolMappers: withApiAudienceMapper(webClient.protocolMappers),
    });
  } else {
    const createResponse = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...webClientSettings,
        protocolMappers: withApiAudienceMapper(),
      }),
    });
    if (!createResponse.ok) {
      throw new Error(`[setup-keycloak] Impossible de créer le client 'project-web' : ${await createResponse.text()}`);
    }
  }
  console.log(`[setup-keycloak] Client SPA configuré pour ${WEB_ORIGIN} avec PKCE et audience project-api.`);
}

/**
 * Crée un utilisateur ou met à jour son mot de passe s'il existe déjà.
 */
async function createOrUpdateUser(
  token: string,
  username: string,
  email: string,
  password: string,
  roles: KeycloakRole[],
): Promise<void> {
  console.log(`[setup-keycloak] Configuration de l'utilisateur '${username}' (${email})...`);

  // 1. Vérification si l'utilisateur existe déjà
  const searchUrl = `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=${encodeURIComponent(username)}&exact=true`;
  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const existingUsers = (await searchResponse.json()) as Array<{ id: string; username: string }>;

  let userId: string;

  if (existingUsers.length > 0) {
    userId = existingUsers[0].id;
    console.log(`[setup-keycloak] L'utilisateur '${username}' existe déjà (ID: ${userId}). Mise à jour de l'email et du mot de passe...`);

    // Mise à jour de l'email et de l'activation
    const updateUrl = `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${userId}`;
    const updateResponse = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        emailVerified: true,
        enabled: true,
      }),
    });

    if (!updateResponse.ok) {
      const err = await updateResponse.text();
      throw new Error(`[setup-keycloak] Erreur mise à jour profil/email pour '${username}': ${err}`);
    }

    // Réinitialisation du mot de passe
    const resetUrl = `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${userId}/reset-password`;
    const resetResponse = await fetch(resetUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "password",
        value: password,
        temporary: false,
      }),
    });

    if (!resetResponse.ok) {
      const err = await resetResponse.text();
      throw new Error(`[setup-keycloak] Erreur réinitialisation mot de passe pour '${username}': ${err}`);
    }
  } else {
    // Création du nouvel utilisateur (CI ou environnement vierge)
    const createUrl = `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users`;
    const createResponse = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        email,
        firstName: username,
        lastName: "User",
        enabled: true,
        emailVerified: true,
        // Pas d'actions requises au premier login (pour autoriser le direct grant en CI)
        requiredActions: [],
        credentials: [
          {
            type: "password",
            value: password,
            temporary: false,
          },
        ],
      }),
    });

    if (!createResponse.ok) {
      const err = await createResponse.text();
      throw new Error(`[setup-keycloak] Erreur création de l'utilisateur '${username}': ${err}`);
    }

    // Récupération de l'ID depuis l'en-tête Location ou par recherche
    const locationHeader = createResponse.headers.get("Location");
    if (locationHeader) {
      userId = locationHeader.split("/").pop()!;
    } else {
      const refetch = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const usersAfter = (await refetch.json()) as Array<{ id: string }>;
      userId = usersAfter[0].id;
    }

    // Réinitialisation explicite pour forcer le mot de passe comme non-temporaire dans Keycloak
    const resetUrl = `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${userId}/reset-password`;
    await fetch(resetUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "password",
        value: password,
        temporary: false,
      }),
    });

    console.log(`[setup-keycloak] Utilisateur '${username}' créé avec succès (ID: ${userId}).`);
  }

  // 2. Attribution des rôles
  if (roles.length > 0) {
    const rolesUrl = `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${userId}/role-mappings/realm`;
    const rolesResponse = await fetch(rolesUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(roles),
    });

    if (!rolesResponse.ok) {
      const err = await rolesResponse.text();
      throw new Error(`[setup-keycloak] Erreur assignation des rôles pour '${username}': ${err}`);
    }
    console.log(`[setup-keycloak] Rôles [${roles.map((r) => r.name).join(", ")}] assignés à '${username}'.`);
  }
}

async function main(): Promise<void> {
  try {
    await waitForKeycloak();
    const token = await getAdminToken();
    await configureSelfRegistration(token);
    await configureOidcClients(token);
    if (CLIENTS_ONLY) {
      console.log("[setup-keycloak] Realm et clients configurés; aucun compte de test modifié.");
      return;
    }

    if (!TEST_USER_PASSWORD || !TEST_ADMIN_PASSWORD) {
      throw new Error("[setup-keycloak] Les mots de passe des comptes de test sont requis.");
    }

    // Récupération des rôles existants dans le Realm
    const userRole = await getRealmRole(token, "user");
    const adminRole = await getRealmRole(token, "admin");

    // Création / configuration du compte utilisateur régulier
    await createOrUpdateUser(token, TEST_USER_USERNAME, TEST_USER_EMAIL, TEST_USER_PASSWORD, [userRole]);

    // Création / configuration du compte administrateur applicatif
    await createOrUpdateUser(token, TEST_ADMIN_USERNAME, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, [adminRole, userRole]);

    console.log("[setup-keycloak] Initialisation des comptes de test Keycloak terminée avec succès !");
  } catch (error) {
    console.error("[setup-keycloak] Erreur d'initialisation :", error);
    process.exit(1);
  }
}

main();
