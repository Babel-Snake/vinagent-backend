# SETUP_BEGINNER.md

This is the current beginner setup guide for the VinAgent repository.

## 1. Prerequisites

Install:

* Node.js LTS
* Git
* MySQL 8+ or a local containerized MySQL

Optional but useful:

* Firebase CLI
* VS Code

## 2. Clone and Install

```bash
git clone <REPO_URL>
cd vinagent-backend
npm install
```

## 3. Environment Variables

Copy `.env.example` to `.env`.

On macOS/Linux:

```bash
cp .env.example .env
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

Important current variables:

```text
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3001

DB_HOST=localhost
DB_PORT=3306
DB_USER=vinagent
DB_PASSWORD=vinagent
DB_NAME=vinagent_dev
DB_DIALECT=mysql

FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

AI_PROVIDER=openai
OPENAI_API_KEY=...
AI_MODEL=gpt-4o-mini
AI_SKIP=false

TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
RETELL_WEBHOOK_SECRET=...
```

Important:

* the repo uses `DB_*` variable names, not `DATABASE_*`
* `ALLOW_TEST_AUTH_BYPASS` should only be enabled for local test/dev scenarios

## 4. Create the Database

Create the local database:

```bash
mysql -u root -p -e "CREATE DATABASE vinagent_dev;"
```

If you want to use the default `.env.example` values exactly, either:

* create the `vinagent` MySQL user locally, or
* change `DB_USER` / `DB_PASSWORD` in `.env` to match your machine

Run migrations:

```bash
npx sequelize db:migrate
```

## 5. Run the API

```bash
npm run dev
```

Useful health checks:

* `http://localhost:3000/`
* `http://localhost:3000/health`
* `http://localhost:3000/api/health`

## 6. Run Tests

All tests:

```bash
npm test
```

Unit tests only:

```bash
npm run test:unit
```

Integration tests only:

```bash
npm run test:int
```

## 7. Common Issues

### MySQL connection errors

Check:

* MySQL is running
* `.env` uses the right `DB_*` values
* the database exists

### Firebase credential issues

Check:

* `FIREBASE_PROJECT_ID`
* `FIREBASE_CLIENT_EMAIL`
* `FIREBASE_PRIVATE_KEY`

### Webhook signature failures in local development

Expected if you do not have real provider secrets configured. Tests cover the signature paths explicitly.

### PowerShell blocks `npm`

If PowerShell execution policy interferes, use `npm.cmd` instead of `npm`.

## 8. What to Read Next

After setup, read:

1. `ARCHITECTURE.md`
2. `DOMAIN_MODEL.md`
3. `API_SPEC.md`
4. `GOLDEN_PATH.md`
5. `TEST_PLAN.md`

Those docs now describe the current build more accurately than the older bootstrap-era planning docs.
