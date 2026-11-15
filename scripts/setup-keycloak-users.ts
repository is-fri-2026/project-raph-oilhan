/**
 * Script d'initialisation des utilisateurs de test dans Keycloak.
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

if (!KC_BOOTSTRAP_ADMIN_PASS || !TEST_USER_PASSWORD || !TEST_ADMIN_PASSWORD) {
  throw new Error(
    "[setup-keycloak] Variables requises manquantes : veuillez définir KEYCLOAK_ADMIN_PASSWORD, KEYCLOAK_USER_PASSWORD et KEYCLOAK_APP_ADMIN_PASSWORD (dans le fichier .env en local ou via GitHub Secrets en CI).",
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
    // Création du nouvel utilisateur
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
        enabled: true,
        emailVerified: true,
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
