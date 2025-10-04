// /scripts/runner.js
/*
  PageSpeed Insights Runner Script
  --------------------------------
  - Picks pending job_results in batches
  - Calls Google PSI API for mobile + desktop
  - Retries failures with exponential backoff
  - Updates job_results in the Postgres DB
  - Designed for GitHub Actions / cron use
*/

import { Pool } from "pg";

const { AbortController, fetch } = global;

// --- Configuration ---
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "5", 10);
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || "45000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "4", 10);
const BASE_DELAY_MS = 1000;

// --- Helpers ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// --- Google PSI Fetch ---
async function callPSI(urlToTest, strategy = "mobile") {
  const encoded = encodeURIComponent(urlToTest);
  const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encoded}&strategy=${strategy}&key=${GOOGLE_API_KEY}`;

  let attempt = 0;
  let lastError;

  while (attempt <= MAX_RETRIES) {
    try {
      attempt++;
      const resp = await fetchWithTimeout(psiUrl);
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`PSI HTTP ${resp.status}: ${body}`);
      }
      return await resp.json();
    } catch (err) {
      lastError = err;
      const backoff = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
      console.warn(`⚠️ PSI call failed (attempt ${attempt}) for ${urlToTest} (${strategy}): ${err.message}`);
      if (attempt > MAX_RETRIES) break;
      await sleep(backoff);
    }
  }
  throw lastError || new Error("Unknown PSI error");
}

// --- Pick pending items ---
async function pickPendingBatch(batchSize) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
        SELECT jr.id, jr.job_id, jr.url
        FROM job_results jr
        WHERE jr.status = 'pending'
        ORDER BY jr.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      `,
      [batchSize]
    );

    if (!rows.length) {
      await client.query("COMMIT");
      return [];
    }

    const ids = rows.map((r) => r.id);
    await client.query(
      `UPDATE job_results SET status = 'in_progress', started_at = NOW() WHERE id = ANY($1::int[])`,
      [ids]
    );

    await client.query("COMMIT");
    return rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// --- Process each job result ---
async function processItem(item) {
  const { id, url } = item;
  const start = Date.now();
  try {
    const [mobile, desktop] = await Promise.allSettled([
      callPSI(url, "mobile"),
      callPSI(url, "desktop"),
    ]);

    const desktopResult = desktop.status === "fulfilled" ? desktop.value : { error: String(desktop.reason) };
    const mobileResult = mobile.status === "fulfilled" ? mobile.value : { error: String(mobile.reason) };
    const duration_ms = Date.now() - start;
    const status = (desktop.status === "fulfilled" || mobile.status === "fulfilled") ? "completed" : "failed";

    await pool.query(
      `
        UPDATE job_results
        SET desktop = $1,
            mobile = $2,
            status = $3,
            completed_at = NOW(),
            duration_ms = $4
        WHERE id = $5
      `,
      [desktopResult, mobileResult, status, duration_ms, id]
    );

    console.log(`${status === "completed" ? "✅" : "❌"} [${id}] ${url} → ${status} (${duration_ms} ms)`);
  } catch (err) {
    console.error(`processItem error for [${id}] ${url}:`, err);
    await pool.query(
      `UPDATE job_results
         SET status='failed', completed_at = NOW(), duration_ms=$1
       WHERE id=$2`,
      [Date.now() - start, id]
    ).catch((e) => console.error("Failed to mark as failed:", e));
  }
}

// --- Main loop ---
async function mainOnce() {
  try {
    const batch = await pickPendingBatch(BATCH_SIZE);
    if (!batch.length) {
      console.log("No pending items found.");
      return false;
    }
    console.log(`Processing batch of ${batch.length} URLs...`);
    await Promise.all(batch.map(processItem));
    return true;
  } catch (err) {
    console.error("Runner mainOnce error:", err);
    return false;
  }
}

async function mainLoop() {
  try {
    let runs = 0;
    while (runs < 10) {
      const didWork = await mainOnce();
      if (!didWork) break;
      runs++;
      await sleep(1000);
    }
    console.log("Runner finished successfully ✅");
    process.exit(0);
  } catch (err) {
    console.error("Runner fatal error:", err);
    process.exit(1);
  }
}

// --- Auto-run when called directly (ESM safe) ---
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  if (!process.env.POSTGRES_URL) {
    console.error("❌ Missing POSTGRES_URL environment variable");
    process.exit(1);
  }
  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ Missing GOOGLE_API_KEY environment variable");
    process.exit(1);
  }
  console.log("🚀 Starting PSI Runner...");
  mainLoop();
}

export { mainLoop };
