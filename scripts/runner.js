// scripts/runner.js
// Run: node scripts/runner.js
// Safe: processes a small batch of pending rows, stores compact metrics + limited filmstrip.

const { Pool } = require('pg');

const POSTGRES_URL = process.env.POSTGRES_URL;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10); // how many rows to fetch per run
const MAX_FRAMES = parseInt(process.env.MAX_FRAMES || '10', 10); // store at most this many frames per strategy
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || '45000', 10);

if (!POSTGRES_URL) {
  console.error('Missing POSTGRES_URL env');
  process.exit(1);
}
if (!GOOGLE_API_KEY) {
  console.error('Missing GOOGLE_API_KEY env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function pickBatch(client, batchSize) {
  // Atomically pick pending rows and mark them running.
  await client.query('BEGIN');
  const selectRes = await client.query(
    `SELECT id, job_id, url
     FROM job_results
     WHERE status = 'pending'
     ORDER BY id ASC
     FOR UPDATE SKIP LOCKED
     LIMIT $1`,
    [batchSize]
  );
  const rows = selectRes.rows;
  if (!rows.length) {
    await client.query('COMMIT');
    return [];
  }
  const ids = rows.map(r => r.id);
  const jobIds = [...new Set(rows.map(r => r.job_id))];
  // mark rows running
  await client.query(
    `UPDATE job_results SET status = 'running' WHERE id = ANY($1::int[])`,
    [ids]
  );
  // mark jobs as running
  await client.query(
    `UPDATE jobs SET status='running' WHERE id = ANY($1::int[])`,
    [jobIds]
  );
  await client.query('COMMIT');
  return rows;
}

function extractCompact(json, maxFrames=MAX_FRAMES) {
  const audits = json?.lighthouseResult?.audits || {};
  const categories = json?.lighthouseResult?.categories || {};

  const score = categories.performance ? Math.round(categories.performance.score * 100) : null;

  // filmstrip sources vary; prefer screenshot-thumbnails, fallback to filmstrip items
  let items =
    audits['screenshot-thumbnails']?.details?.items ||
    audits['filmstrip']?.details?.items ||
    [];

  // normalize items -> { timing, data }
  const frames = (items || []).slice(0, maxFrames).map(it => {
    if (!it) return null;
    if (typeof it === 'string') return { timing: null, data: it };
    return { timing: it.timing ?? it.timestamp ?? null, data: it.data ?? it };
  }).filter(Boolean);

  return {
    score,
    lcp: audits['largest-contentful-paint']?.displayValue ?? null,
    fcp: audits['first-contentful-paint']?.displayValue ?? null,
    tbt: audits['total-blocking-time']?.displayValue ?? null,
    cls: audits['cumulative-layout-shift']?.displayValue ?? null,
    filmstrip: frames
  };
}

// small helper: fetch with timeout
async function fetchWithTimeout(url, opts = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function runOne(url) {
  const endpoint = (strategy) =>
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&key=${GOOGLE_API_KEY}`;

  // call mobile then desktop (or desktop then mobile — whichever you prefer)
  const mobileResRaw = await fetchWithTimeout(endpoint('mobile'));
  const mobileJson = await mobileResRaw.json();

  // small polite wait to reduce throttle risk
  await new Promise(r => setTimeout(r, 500));

  const desktopResRaw = await fetchWithTimeout(endpoint('desktop'));
  const desktopJson = await desktopResRaw.json();

  return {
    mobile: extractCompact(mobileJson, MAX_FRAMES),
    desktop: extractCompact(desktopJson, MAX_FRAMES),
  };
}

async function markJobDoneIfComplete(client, jobId) {
  // If no pending/running rows remain for the job, mark job done
  const res = await client.query(
    `SELECT 1 FROM job_results WHERE job_id = $1 AND status != 'done' LIMIT 1`,
    [jobId]
  );
  if (res.rowCount === 0) {
    await client.query(`UPDATE jobs SET status='done' WHERE id=$1`, [jobId]);
  }
}

(async function main() {
  console.log('PSI Runner starting — batch size:', BATCH_SIZE, 'max frames:', MAX_FRAMES);
  const client = await pool.connect();
  try {
    // pick a batch of pending rows and mark them running
    const rows = await pickBatch(client, BATCH_SIZE);
    if (!rows.length) {
      console.log('No pending rows found — exiting.');
      client.release();
      await pool.end();
      return;
    }

    console.log(`Picked ${rows.length} rows. Processing...`);
    for (const row of rows) {
      const id = row.id;
      const url = row.url;
      const jobId = row.job_id;
      console.log(`Processing id=${id} url=${url}`);

      const start = Date.now();
      try {
        const { desktop, mobile } = await runOne(url);
        const duration_ms = Date.now() - start;

        // store compact results
        await pool.query(
          `UPDATE job_results
           SET status='done', desktop=$1::jsonb, mobile=$2::jsonb, completed_at = NOW(), duration_ms = $3
           WHERE id = $4`,
          [JSON.stringify(desktop), JSON.stringify(mobile), duration_ms, id]
        );

        console.log(`Saved id=${id} (${(duration_ms/1000).toFixed(1)}s)`);
        // check if job complete
        await markJobDoneIfComplete(pool, jobId);
      } catch (err) {
        console.error(`Error processing id=${id} url=${url}:`, err.message || err);
        // mark error so it won't stuck forever (you can retry later)
        await pool.query(
          `UPDATE job_results SET status='error', completed_at = NOW() WHERE id = $1`,
          [id]
        );
      }

      // polite delay between rows (avoid bursts)
      await new Promise(r => setTimeout(r, 800));
    }

    console.log('Batch finished.');
  } catch (err) {
    console.error('Runner error:', err);
  } finally {
    try { await client.release(); } catch(e){}
    try { await pool.end(); } catch(e){}
  }
})();
