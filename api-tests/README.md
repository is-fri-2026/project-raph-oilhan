# API tests

The Bruno collection is stored in [`bruno/`](./bruno/). Each `.bru` file is
one HTTP request and its assertions. Keep the collection files in the
repository; do not copy them elsewhere.

## Run the tests in Docker (recommended)

Docker Compose starts the database, Keycloak, migrations, seed data, test
accounts, and API. No Node.js installation on the host is required.

1. Create `.env` from the root `.env.example` if you have not already done so,
   then set the local passwords.
2. Start the stack:

   ```bash
   docker compose up --build -d
   ```

   Compose imports the Keycloak realm, initializes PostgreSQL, and provisions
   the `user1` and `admin` test accounts before the API starts.
3. Run Bruno in a container:

   ```bash
   docker compose --profile test run --build --rm api-tests
   ```

   The test container reads the passwords from `.env` and connects to the API
   and Keycloak over the Compose network.

To run the stack and test suite together, use:

```bash
docker compose --profile test up --build --abort-on-container-exit --exit-code-from api-tests api-tests
```

This command stops the stack when the test container exits. Named volumes
remain; remove them with `docker compose down --volumes` only when you want to
delete local database and Keycloak data.

## Run with the API on the host

This option requires Node.js and npm on the host. After `npm ci`, start the
database and Keycloak, initialize the database, and create the test accounts:

```bash
npm ci
docker compose up -d postgres keycloak
npx prisma migrate deploy
npx prisma db seed
docker compose run --build --rm keycloak-setup
npm run dev
```

In another terminal, run:

```bash
npm run test:api
```

The runner reads the test passwords from the root `.env`; Bruno obtains and
propagates the access tokens between requests.

## Bruno GUI

1. Start the API, database, and Keycloak using one of the setup options above.
2. In Bruno, choose **Open Collection** and select `api-tests/bruno/`.
3. Select the `local` environment and run the collection.

The GUI does not load test passwords from the root `.env`. The checked-in
`local` environment is tracked by Git, so do not put real passwords or tokens
in it. Use the Docker CLI workflow unless you have a private way to supply
credentials to the GUI.

The collection covers:

- `GET /health`
- User list: success, unauthenticated (`401`) and forbidden (`403`)
- User read/update/delete: success, validation, forbidden and not found (`404`)
- Software-alternative list: success, invalid pagination (`400`), and owner-only approved results
- Software-alternative create: success, validation and unauthenticated (`401`)
- Software-alternative read/update/delete: success, validation, forbidden and not found (`404`); administrators can delete approved alternatives

## Test data and secrets

The local environment is defined in
[`bruno/environments/local.bru`](./bruno/environments/local.bru). Its IDs
should match the seeded local database. The collection includes delete
requests, so re-run `docker compose run --build --rm seed` to restore initial
test data in Docker-only mode, or `npx prisma db seed` when running commands
on the host.

Do not commit passwords, tokens, or API keys. The admin token is only used
for the administrator-only user-list test; using it for all requests would
invalidate the ownership and forbidden-access tests.
