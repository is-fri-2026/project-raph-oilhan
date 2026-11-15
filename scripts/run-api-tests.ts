/**
 * ============================================================================
 * RUNNER DE TESTS D'INTÉGRATION BRUNO AVEC CENTRALISATION DANS LE .ENV
 * ============================================================================
 * 
 * POURQUOI CE SCRIPT EST NÉCESSAIRE :
 * -----------------------------------
 * 1. Centralisation des secrets :
 *    Nous voulons que TOUS les mots de passe soient définis à un seul endroit :
 *    dans le fichier '.env' à la racine du projet (KEYCLOAK_USER_PASSWORD, etc.).
 *    Cela évite d'écrire des mots de passe en dur dans 'local.bru' ou dans Git.
 * 
 * 2. Incompatibilité des shells entre Windows et Linux :
 *    - Sous Linux/Bash, on peut charger un .env avec "export $(cat .env)".
 *    - Sous Windows (PowerShell/CMD), cette commande n'existe pas.
 *    Il n'existe aucune commande shell native capable de charger un .env
 *    qui fonctionne à la fois sous Windows et sous Linux sans outil externe.
 * 
 * 3. Exigence du répertoire d'exécution par Bruno CLI :
 *    Bruno CLI (@usebruno/cli) exige d'être exécuté directement dans le dossier
 *    où se trouve 'bruno.json' (ici 'api-tests/bruno'), sinon il affiche l'erreur :
 *    "You can run only at the root of a collection".
 * 
 * CE QUE FAIT CE SCRIPT :
 * -----------------------
 * 1. Charge les variables du fichier '.env' de la racine avec 'dotenv/config'.
 * 2. Vérifie que les mots de passe de test sont bien présents.
 * 3. Se positionne dynamiquement dans le dossier 'api-tests/bruno'.
 * 4. Lance '@usebruno/cli' via 'npx' en injectant les mots de passe du '.env'
 *    via les arguments '--env-var'.
 * 5. Propage le code de retour exact (0 si succès, 1 si échec) pour la console et la CI.
 */

// 1. Charge automatiquement les variables définies dans le fichier '.env' de la racine
import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

// 2. Détermination du chemin absolu vers la collection Bruno (où réside bruno.json)
const brunoCollectionDir = path.resolve(process.cwd(), "api-tests/bruno");

// 3. Récupération des mots de passe depuis les variables d'environnement (chargées depuis le .env)
const userPassword = process.env.KEYCLOAK_USER_PASSWORD;
const adminPassword = process.env.KEYCLOAK_APP_ADMIN_PASSWORD;

// Vérification de sécurité : si les mots de passe manquent dans le .env, on prévient clairement
if (!userPassword || !adminPassword) {
  console.error("❌ ERREUR : Mots de passe introuvables dans votre fichier .env !");
  console.error("Veuillez vous assurer que votre fichier .env contient :");
  console.error("  KEYCLOAK_USER_PASSWORD=VotreMotDePasseUser");
  console.error("  KEYCLOAK_APP_ADMIN_PASSWORD=VotreMotDePasseAdmin\n");
  process.exit(1);
}

// 4. Construction des arguments de la commande Bruno CLI
// On injecte les mots de passe du .env directement dans les variables de collection Bruno
const cliArgs = [
  "--yes",
  "@usebruno/cli",
  "run",
  "--env",
  "local",
  "--env-var",
  `keycloakUserPassword=${userPassword}`,
  "--env-var",
  `keycloakAdminPassword=${adminPassword}`,
  // Transmet d'éventuels arguments supplémentaires passés en ligne de commande
  ...process.argv.slice(2),
];

console.log("🚀 Lancement des tests Bruno avec les identifiants centralisés depuis le .env ...");

// 5. Exécution de Bruno CLI dans le répertoire de la collection (cwd)
const execution = spawnSync("npx", cliArgs, {
  cwd: brunoCollectionDir, // Exécute la commande DANS api-tests/bruno
  stdio: "inherit",       // Affiche les logs et le tableau récapitulatif directement dans le terminal
  shell: true,            // Assure la compatibilité sur Windows (cmd/powershell) et Linux
  env: process.env,       // Transmet l'environnement complet
});

// 6. Quitte avec le même code d'erreur que Bruno (0 si tous les tests passent, > 0 si un test échoue)
process.exit(execution.status ?? 0);
