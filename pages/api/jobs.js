import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  const client = await pool.connect();

  try {
    console.log("🟢 STEP 1: Checking columns...");
    const columnsRes = await client.query(`
      SELECT column_name, table_name
      FROM information_schema.columns
      WHERE table_name IN ('jobs', 'job_results');
    `);

    const columns = columnsRes.rows.map(r => `${r.table_name}.${r.column_name}`);
    console.log("✅ Found columns:", columns);

    const hasCreatedAt = columns.includes("jobs.created_at");
    const hasDuration = columns.includes("job_results.duration_ms");

    console.log("🟢 STEP 2: Fetching jobs...");
    const orderBy = hasCreatedAt ? "ORDER BY created_at DESC" : "ORDER BY id DESC";
    const jobsRes = await client.query(`SELECT * FROM jobs ${orderBy}`);
    const jobs = jobsRes.rows;

    console.log(`✅ STEP 2: Found ${jobs.length} jobs`);

    const enrichedJobs = [];

    for (const job of jobs) {
      console.log(`🟡 Processing job ID: ${job.id}`);

      const statsQuery = `
        SELECT 
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='done')::int AS done,
          COUNT(*) FILTER (WHERE status='error')::int AS error,
          COUNT(*) FILTER (WHERE status IN ('pending','running'))::int AS remaining
          ${hasDuration ? ", AVG(duration_ms)::float AS avg_duration" : ""}
        FROM job_results
        WHERE job_id = $1;
      `;
      const statsRes = await client.query(statsQuery, [job.id]);
      const s = statsRes.rows[0] || {};

      const total = s.total || 0;
      const done = s.done || 0;
      const error = s.error || 0;
      const remaining = s.remaining || 0;
      const avgDuration = s.avg_duration || 0;

      let progress = total > 0 ? Math.floor((done / total) * 100) : 0;
      if (done > 0 && progress === 0) progress = 1;

      let eta = null;
      if (avgDuration && remaining > 0) {
        eta = Math.max(1, Math.round((avgDuration * remaining) / 60000));
      } else if (remaining > 0) {
        eta = "Calculating...";
      }

      enrichedJobs.push({
        ...job,
        total,
        done,
        error,
        remaining,
        progress,
        etaMinutes: eta,
      });
    }

    console.log(`✅ STEP 3: Enriched ${enrichedJobs.length} jobs`);
    return res.json({ ok: true, jobs: enrichedJobs });
  } catch (err) {
    console.error("❌ /api/jobs error:", err.stack || err);
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}
