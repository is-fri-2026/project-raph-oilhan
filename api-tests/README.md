# API tests

The Bruno collection is stored in [`bruno/`](./bruno/). Each `.bru` file is
one HTTP request and its assertions. Commit these files with the project and
open the collection directly in Bruno; do not copy them elsewhere.

## Run the collection

### Option A: Via Command Line (Automated)

1. Ensure Keycloak is running: `docker compose up -d keycloak`
2. Initialize test accounts: `npm run setup:keycloak`
3. Start the API: `npm run dev`
4. Run all Bruno tests:
   ```bash
   npm run test:api
   ```

### Option B: Via Bruno GUI

1. Start the API locally on `http://localhost:8080`.
2. Start Keycloak and initialize accounts with `npm run setup:keycloak`.
3. In Bruno, choose **Open Collection** and select `api-tests/bruno/`.
4. Select the `local` environment.
5. In `local.bru`, enter your local test credentials for `keycloakUserPassword` and `keycloakAdminPassword` (or pass them via variables).
6. Right-click on the collection and click **Run**.
   *(Tokens are automatically captured by `Authentication/Get user token` and `Get admin token` and propagated to all subsequent requests without manual copy/paste).*

The collection covers:

- `GET /health`
- Authentication is provided by Keycloak, outside this API collection.
- User list: success, unauthenticated (`401`) and forbidden (`403`)
- User read/update/delete: success, validation, forbidden and not found (`404`)
- Software-alternative list: success and invalid pagination (`400`)
- Software-alternative create: success, validation and unauthenticated (`401`)
- Software-alternative read/update/delete: success, validation, forbidden and not found (`404`)

## Environment variables

The local environment is defined in
[`bruno/environments/local.bru`](./bruno/environments/local.bru).

Update these IDs to match your local database:

- `userToken`: a normal user token, used for ownership and `403` tests
- `adminToken`: an administrator token, used for administrator-only requests
- `userId`: the user represented by `userToken`
- `otherUserId`: another user, used for the `403` test
- `deletableUserId`: a disposable user, used by the `204` delete test
- `alternativeId`: an alternative owned by `userId`
- `pendingAlternativeId`: another user's alternative, that can be modified
- `deletableAlternativeId`: a disposable alternative, used by the `204` delete test
- `otherUserAlternativeId` : use for `403`, modify an alternative that is not yours
- `taskId`: an existing task

Run delete tests last because they permanently remove their target resources.
Do not commit real passwords, tokens or API keys.

Note : AdminToken is used only for testing List users. We can't use adminToken everywhere otherwise the Get user forbidden would work.
