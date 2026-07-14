// crondom-scheduler — runs inside a GitHub Actions workflow
// Fetches due cron jobs from Turso, executes them, logs results.

import cronParser from "cron-parser";
import { db } from "./db.js";

function isDue(expression) {
  try {
    const interval = cronParser.parseExpression(expression);
    const next = interval.next().getTime();
    const now = Date.now();
    // Due if the next occurrence is within the last 60 seconds.
    // This accounts for small scheduling jitter in GH Actions.
    return next <= now + 1000 && next > now - 60_000;
  } catch {
    return false;
  }
}

function parseNextRun(expression, from = new Date()) {
  const interval = cronParser.parseExpression(expression, { currentDate: from });
  return interval.next().toISOString();
}

async function executeJob(job) {
  const logId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // Insert a "running" log entry
  await db.execute({
    sql: `INSERT INTO execution_logs (id, job_id, status, started_at)
          VALUES (?, ?, 'running', ?)`,
    args: [logId, job.id, startedAt],
  });

  try {
    let headers = {};
    try {
      headers = JSON.parse(job.headers || "{}");
    } catch {
      // fallback to empty headers
    }

    const response = await fetch(job.url, {
      method: job.method || "GET",
      headers: { ...headers, "User-Agent": "crondom-scheduler/1.0" },
      body: job.method !== "GET" && job.method !== "HEAD" ? job.body || undefined : undefined,
    });

    const output = await response.text();
    const finishedAt = new Date().toISOString();

    await db.execute({
      sql: `UPDATE execution_logs
            SET status = 'success', status_code = ?, output = ?, finished_at = ?
            WHERE id = ?`,
      args: [response.status, output.slice(0, 5000), finishedAt, logId],
    });

    console.log(`✅ ${job.name}: ${response.status} (${job.url})`);
  } catch (error) {
    const finishedAt = new Date().toISOString();

    await db.execute({
      sql: `UPDATE execution_logs
            SET status = 'failure', error = ?, finished_at = ?
            WHERE id = ?`,
      args: [error.message.slice(0, 2000), finishedAt, logId],
    });

    console.error(`❌ ${job.name}: ${error.message} (${job.url})`);
  }
}

async function run() {
  console.log(`[${new Date().toISOString()}] Checking for due jobs...`);

  try {
    const result = await db.execute("SELECT * FROM cron_jobs WHERE enabled = 1");
    const now = new Date();
    let dueCount = 0;

    for (const job of result.rows) {
      if (isDue(job.expression)) {
        console.log(`  → Executing: ${job.name} (${job.url})`);
        await executeJob(job);
        dueCount++;
      }
    }

    if (dueCount === 0) {
      console.log("  No jobs due this cycle.");
    } else {
      console.log(`  Done: ${dueCount} job(s) executed.`);
    }
  } catch (error) {
    console.error("Scheduler error:", error.message);
    process.exit(1);
  }
}

run();
