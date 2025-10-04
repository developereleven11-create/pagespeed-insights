// /scripts/runner.js
/* Node runner for PageSpeed Insights jobs
   - Picks pending job_results in batches
   - Calls Google PSI for mobile+desktop
   - Retries aborted/failure with exponential backoff
   - Updates job_results with desktop/mobile JSON and status
*/

import { Pool } from "pg";
import fetch from "node-fetch"; // if your environment has global fetch you can remove this
import AbortController from "abort-controller";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "5", 10);
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || "45000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "4", 10);
const BASE_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function callPSI(urlToTest, strategy = "mobile") {
  const encoded = encodeURIComponent(urlToTest);
  const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encoded}&strategy=${strategy}&key=${GOOGLE_API_KEY}`;
  let attempt = 0;
  let lastError = null;

  while (attempt <= MAX_RETRIES) {
    try {
      attempt++;
      const resp = await fetchWithTimeout(url);
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`PSI HTTP ${resp.status}: ${body}`);
      }
      const json = await resp.json();
      return json;
    } catch (err) {
      lastError = err;
      const isAbort = err.name === "AbortError" || err.message?.toLowerCase()?.includes("aborted");
      const backoff = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
      console.warn(`PSI call failed (attempt ${attempt}) for ${urlToTest} (${strategy}):`, err.message || err);
      if (attempt > MAX_RETRIES) break;
      await sleep(backoff);
    }
  }
  throw lastError || new Error("Unknown PSI error");
}

async function pickPendingBatch(batchSize) {
  // Select pending job_results with FOR UPDATE SKIP LOCKED to allow concurrent runners safely (if DB supports it)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selectQuery = `
      SELECT jr.id, jr.job_id, jr.url
      FROM job_results jr
      WHERE jr.status = 'pending'
      ORDER BY jr.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    `;
    const sel = await client.query(selectQuery, [batchSize]);
    const rows = sel.rows;
    if (!rows.length) {
      await client.query("COMMIT");
      return [];
    }

    // mark them as 'in_progress' so we don't pick them again
    const ids = rows.map((r) => r.id);
    await client.query(
      `UPDATE job_results SET status='in_progress', started_at = NOW() WHERE id = ANY($1::int[])`,
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

async function processItem(item) {
  const { id, url } = item;
  const start = Date.now();
  try {
    // call both strategies in parallel but with their own retry logic
    const [mobile, desktop] = await Promise.allSettled([
      callPSI(url, "mobile"),
      callPSI(url, "desktop"),
    ]);

    const desktopResult = desktop.status === "fulfilled" ? desktop.value : { error: String(desktop.reason) };
    const mobileResult = mobile.status === "fulfilled" ? mobile.value : { error: String(mobile.reason) };

    const duration_ms = Date.now() - start;
    const status = (desktop.status === "fulfilled" || mobile.status === "fulfilled") ? "completed" : "failed";

    const updateQuery = `
      UPDATE job_results
      SET
        desktop = $1,
        mobile = $2,
        status = $3,
        completed_at = NOW(),
        duration_ms = $4
      WHERE id = $5
      RETURNING *
    `;
    const vals = [desktopResult, mobileResult, status, duration_ms, id];
    await pool.query(updateQuery, vals);
    console.log(`${status === "completed" ? "✅" : "❌"} Result [${id}] ${url} -> ${status} in ${duration_ms}ms`);
  } catch (err) {
    console.error("processItem error:", err);
    // mark failed with error message (truncate to avoid huge error fields)
    const msg = String(err.message || err).slice(0, 2000);
    await pool.query(
      `UPDATE job_results SET status='failed', completed_at = NOW(), duration_ms = $1, desktop = desktop, mobile = mobile WHERE id = $2`,
      [Math.max(0, Date.now() - start), id]
    ).catch((e) => console.error("Error marking failed:", e));
  }
}

async function mainOnce() {
  try {
    const batch = await pickPendingBatch(BATCH_SIZE);
    if (!batch.length) {
      console.log("No pending items found.");
      return false;
    }
    console.log(`Processing batch of ${batch.length} items...`);
    // Process concurrently but limit concurrency to batch size
    await Promise.all(batch.map(processItem));
    return true;
  } catch (err) {
    console.error("Runner mainOnce error:", err);
    return false;
  }
}

async function mainLoop() {
  try {
    // One-shot runner; CI / cron should call this script repeatedly.
    // We'll loop a few times to finish queued batches in a single run (safe).
    let runs = 0;
    while (runs < 10) {
      const didWork = await mainOnce();
      if (!didWork) break;
      runs++;
      // small pause between batches to avoid rate-limits
      await sleep(1000);
    }
    console.log("Runner finished.");
    process.exit(0);
  } catch (err) {
    console.error("Runner fatal error:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  if (!process.env.POSTGRES_URL) {
    console.error("Missing POSTGRES_URL env var");
    process.exit(1);
  }
  if (!process.env.GOOGLE_API_KEY) {
    console.error("Missing GOOGLE_API_KEY env var");
    process.exit(1);
  }
  mainLoop();
}

export { mainLoop };
