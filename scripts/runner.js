// /scripts/runner.js
/*
  PageSpeed Insights Runner (Lightweight)
  --------------------------------------
  ✅ Fetches PSI data for URLs
  ✅ Saves only metrics + filmstrip screenshots
  ✅ Forces IPv4 to avoid Supabase IPv6 ENETUNREACH issues
  ❌ Skips storing full Lighthouse JSONs
*/

import dns from "dns";
dns.setDefaultResultOrder("ipv4first"); // 👈 Force IPv4 for all network requests

import { Pool } from "pg";
const { AbortController, fetch } = global;

// --- Config ---
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "5", 10);
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || "90000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "4", 10);
const BASE_DELAY_MS = 1000;

// --- Helpers ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const extractSafe = (obj, path, fallback = null) =>
  path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : fallback), obj);

// --- PSI Fetch ---
async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function callPSI(urlToTest, strategy = "mobile") {
  const encoded = encodeURIComponent(urlToTest);
  const apiURL = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encoded}&strategy=${strategy}&key=${GOOGLE_API_KEY}`;
  let attempt = 0;
  let lastError = null;

  while (attempt <= MAX_RETRIES) {
    try {
      attempt++;
      const resp = await fetchWithTimeout(apiURL);
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`PSI HTTP ${resp.status}: ${body}`);
      }
      const json = await resp.json();

      // Extract only metrics + filmstrip
      const metrics = {
        strategy,
        lcp: extractSafe(json, "lighthouseResult.audits.largest-contentful-paint.numericValue"),
        fcp: extractSafe(json, "lighthouseResult.audits.first-contentful-paint.numericValue"),
        cls: extractSafe(json, "lighthouseResult.audits.cumulative-layout-shift.numericValue"),
        si: extractSafe(json, "lighthouseResult.audits.speed-index.numericValue"),
        tbt: extractSafe(json, "lighthouseResult.audits.total-blocking-time.numericValue"),
        tti: extractSafe(json, "lighthouseResult.audits.interactive.numericValue"),
        performance: extractSafe(json, "lighthouseResult.categories.performance.score"),
        fetchTime: extractSafe(json, "analysisUTCTimestamp"),
      };

      const filmstrip =
        extractSafe(json, "lighthouseResult.audits.screenshot-thumbnails.details.items") || [];

      return { metrics, filmstrip };
    } catch (err) {
      lastError = err;
      const backoff = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 300;
      console.warn(`⚠️ PSI call failed (attempt ${attempt}) for ${urlToTest} (${strategy}): ${err.message}`);
      if (attempt > MAX_RETRIES) break;
      await sleep(backoff);
    }
  }
  throw lastError || new Error("Unknown PSI error");
}

// --- DB helpers ---
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

// --- Process each URL ---
async function processItem(item) {
  const { id, url } = item;
  const start = Date.now();
  try {
    const [mobile, desktop] = await Promise.allSettled([
      callPSI(url, "mobile"),
      callPSI(url, "desktop"),
    ]);

    const data = {
      mobile: mobile.status === "fulfilled" ? mobile.value : null,
      desktop: desktop.status === "fulfilled" ? desktop.value : null,
    };

    const duration_ms = Date.now() - start;
    const status = data.mobile || data.desktop ? "completed" : "failed";

    await pool.query(
      `
        UPDATE job_results
        SET
          status = $1,
          completed_at = NOW(),
          duration_ms = $2,
          mobile = $3,
          desktop = $4
        WHERE id = $5
      `,
      [status, duration_ms, data.mobile, data.desktop, id]
    );

    console.log(`${status === "completed" ? "✅" : "❌"} [${id}] ${url} → ${status} (${duration_ms} ms)`);
  } catch (err) {
    console.error(`processItem error for [${id}] ${url}:`, err.message);
    await pool.query(
      `UPDATE job_results SET status='failed', completed_at = NOW(), duration_ms=$1 WHERE id=$2`,
      [Date.now() - start, id]
    );
  }
}

// --- Runner loop ---
async function mainOnce() {
  const batch = await pickPendingBatch(BATCH_SIZE);
  if (!batch.length) {
    console.log("No pending items found.");
    return false;
  }
  console.log(`Processing batch of ${batch.length} URLs...`);
  await Promise.all(batch.map(processItem));
  return true;
}

async function mainLoop() {
  let runs = 0;
  while (runs < 10) {
    const didWork = await mainOnce();
    if (!didWork) break;
    runs++;
    await sleep(1000);
  }
  console.log("Runner finished ✅");
  process.exit(0);
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  if (!process.env.POSTGRES_URL || !process.env.GOOGLE_API_KEY) {
    console.error("❌ Missing required env vars");
    process.exit(1);
  }
  console.log("🚀 Starting PSI Runner (Light Mode)...");
  mainLoop();
}

export { mainLoop };
