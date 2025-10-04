// scripts/runner.js
// PageSpeed runner with retries + backoff + error recycling

const { Pool } = require("pg");

const POSTGRES_URL = process.env.POSTGRES_URL;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "5", 10);
const MAX_FRAMES = parseInt(process.env.MAX_FRAMES || "5", 10); // fewer frames = less DB
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || "60000", 10); // 60s
const DELAY_BETWEEN_URLS = parseInt(process.env.DELAY_BETWEEN_URLS || "3000", 10); // 3s
const MAX_RETRIES = 3;
const RETRY_COOLDOWN_HOURS = 6;

if (!POSTGRES_URL || !GOOGLE_API_KEY) {
  console.error("❌ Missing POSTGRES_URL or GOOGLE_API_KEY");
  process.exit(1);
}

const pool = new Pool({
  connectionString: POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// Reset stuck rows
async function resetStuck(client) {
  const res = await client.query(
    `UPDATE job_results
     SET status = 'pending'
     WHERE status = 'running'
       AND completed_at IS NULL
       AND created_at < NOW() - INTERVAL '30 minutes'
     RETURNING id`
  );
  if (res.rowCount > 0) {
    console.log(`🔄 Reset ${res.rowCount} stuck rows`);
  }
}

// Atomically pick batch of pending rows
async function pickBatch(client, batchSize) {
  await client.query("BEGIN");

  const selectRes = await client.query(
    `SELECT id, job_id, url, retries
     FROM job_results
     WHERE status = 'pending'
       AND (retries < $2 OR (status='pending' AND updated_at < NOW() - INTERVAL '${RETRY_COOLDOWN_HOURS} hours'))
     ORDER BY id ASC
     FOR UPDATE SKIP LOCKED
     LIMIT $1`,
    [batchSize, MAX_RETRIES]
  );

  const rows = selectRes.rows;
  if (!rows.length) {
    await client.query("COMMIT");
    return [];
  }

  const ids = rows.map((r) => r.id);
  const jobIds = [...new Set(rows.map((r) => r.job_id))];

  await client.query(
    `UPDATE job_results
     SET status = 'running', updated_at = NOW()
     WHERE id = ANY($1::int[])`,
    [ids]
  );

  await client.query(
    `UPDATE jobs SET status='running' WHERE id = ANY($1::int[])`,
    [jobIds]
  );

  await client.query("COMMIT");
  return rows;
}

function extractCompact(json) {
  const audits = json?.lighthouseResult?.audits || {};
  const categories = json?.lighthouseResult?.categories || {};
  const score = categories.performance
    ? Math.round(categories.performance.score * 100)
    : null;

  const items =
    audits["screenshot-thumbnails"]?.details?.items ||
    audits["filmstrip"]?.details?.items ||
    [];

  const frames = items.slice(0, MAX_FRAMES).map((it) => ({
    timing: it.timing ?? it.timestamp ?? null,
    data: it.data || it,
  }));

  return {
    score,
    lcp: audits["largest-contentful-paint"]?.displayValue ?? null,
    fcp: audits["first-contentful-paint"]?.displayValue ?? null,
    tbt: audits["total-blocking-time"]?.displayValue ?? null,
    cls: audits["cumulative-layout-shift"]?.displayValue ?? null,
    filmstrip: frames,
  };
}

async function fetchWithTimeout(url, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function runOne(url) {
  const endpoint = (strategy) =>
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      url
    )}&strategy=${strategy}&category=performance&key=${GOOGLE_API_KEY}`;

  const mobileRes = await fetchWithTimeout(endpoint("mobile"));
  const mobileJson = await mobileRes.json();

  await new Promise((r) => setTimeout(r, 1000));

  const desktopRes = await fetchWithTimeout(endpoint("desktop"));
  const desktopJson = await desktopRes.json();

  return {
    mobile: extractCompact(mobileJson),
    desktop: extractCompact(desktopJson),
  };
}

async function markJobDoneIfComplete(client, jobId) {
  const res = await client.query(
    `SELECT 1 FROM job_results WHERE job_id = $1 AND status NOT IN ('done','error') LIMIT 1`,
    [jobId]
  );
  if (res.rowCount === 0) {
    await client.query(`UPDATE jobs SET status='done' WHERE id=$1`, [jobId]);
    console.log(`✅ Job ${jobId} marked as done`);
  }
}

(async function main() {
  console.log(
    `🚀 PSI Runner — batch=${BATCH_SIZE}, delay=${DELAY_BETWEEN_URLS}ms, maxFrames=${MAX_FRAMES}`
  );
  const client = await pool.connect();
  try {
    await resetStuck(client);

    const rows = await pickBatch(client, BATCH_SIZE);
    if (!rows.length) {
      console.log("📭 No pending rows — exiting.");
      return;
    }

    console.log(`📦 Picked ${rows.length} URLs`);
    for (const row of rows) {
      const { id, url, job_id, retries } = row;
      console.log(`⏳ Processing [${id}] ${url}`);
      const start = Date.now();

      try {
        const { desktop, mobile } = await runOne(url);
        const duration_ms = Date.now() - start;

        await pool.query(
          `UPDATE job_results
           SET status='done',
               desktop=$1::jsonb,
               mobile=$2::jsonb,
               completed_at = NOW(),
               updated_at = NOW(),
               duration_ms = $3,
               error_message = NULL
           WHERE id = $4`,
          [JSON.stringify(desktop), JSON.stringify(mobile), duration_ms, id]
        );

        console.log(
          `✅ Done [${id}] in ${(duration_ms / 1000).toFixed(1)}s (score D:${desktop.score} / M:${mobile.score})`
        );

        await markJobDoneIfComplete(pool, job_id);
      } catch (err) {
        console.error(`❌ Error [${id}] ${url}:`, err.message || err);

        if (retries + 1 < MAX_RETRIES) {
          await pool.query(
            `UPDATE job_results
             SET status='pending',
                 retries = retries + 1,
                 updated_at = NOW(),
                 error_message = $2
             WHERE id = $1`,
            [id, err.message || "unknown"]
          );
          console.log(`↩️  Will retry [${id}] (retry ${retries + 1}) after cooldown`);
        } else {
          await pool.query(
            `UPDATE job_results
             SET status='error',
                 retries = retries + 1,
                 completed_at = NOW(),
                 updated_at = NOW(),
                 error_message = $2
             WHERE id = $1`,
            [id, err.message || "unknown"]
          );
          console.log(`❌ Permanently failed [${id}] after ${MAX_RETRIES} retries`);
        }
      }

      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_URLS));
    }

    console.log("🎉 Batch finished");
  } catch (err) {
    console.error("Runner error:", err);
  } finally {
    client.release();
    await pool.end();
  }
})();
