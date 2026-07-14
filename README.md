# crondom-scheduler

The scheduler engine for [crondom](https://github.com/temidayoxyz/crondom) — runs inside a GitHub Actions workflow every minute to check for and execute due cron jobs.

## How it works

1. A GitHub Actions scheduled workflow runs every **1 minute** (`scheduler.yml`)
2. It connects to **Turso** (SQLite-compatible edge DB) and queries enabled cron jobs
3. For each job whose cron expression matches the current time, it **executes an HTTP request** to the configured URL
4. Results are logged to the `execution_logs` table in Turso

## Stack

- **Runtime**: GitHub Actions (ubuntu-latest)
- **Database**: Turso via `@libsql/client`
- **Cron parsing**: `cron-parser`
- **Language**: Node.js 20 (ESM)

## Setup

### 1. Get your Turso database URL and token

From the [Turso dashboard](https://turso.tech), grab your database URL and create an auth token.

### 2. Initialize the schema

```bash
cp .env.example .env   # fill in Turso creds
npm install
npm run db:init
```

This creates the `cron_jobs` and `execution_logs` tables.

### 3. Add secrets to GitHub

In your repo settings → **Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://crondom-xxx.turso.io` |
| `TURSO_AUTH_TOKEN` | The token from Turso |

### 4. That's it

Push to `main` — the workflow runs automatically every minute. You can also trigger it manually from the Actions tab.

## Database Schema

```sql
-- Stores job definitions
cron_jobs (
  id, user_id, name, expression, url, method,
  headers, body, enabled, created_at, updated_at
)

-- Stores execution history
execution_logs (
  id, job_id, status, status_code, output,
  error, started_at, finished_at
)
```

---

**Frontend repo**: [crondom](https://github.com/temidayoxyz/crondom)
