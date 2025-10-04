import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    // Check if 'created_at' exists before ordering
    const columnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'jobs';
    `);

    const hasCreatedAt = columnCheck.rows.some(c => c.column_name === "created_at");
    const orderBy = hasCreatedAt ? "ORDER BY created_at DESC" : "";

    // Get all jobs
    const jobsRes = await client.query(`SELECT * FROM jobs ${orderBy}`);
    const jobs = jobsRes.rows;

    const enrichedJobs = [];
    for (const job of jobs) {
      // Check if duration_ms exists once
      const resultColumns = await client.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'job_results';
      `);
      const hasDuration = resultColumns.rows.some(c => c.column_name === "duration_ms");

      const statsQuery = `
        SELECT 
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status='done')::int as done,
          COUNT(*) FILTER (WHERE status='error')::int as error,
          COUNT(*) FILTER (WHERE status IN ('pending','running'))::int as remaining
          ${hasDuration ? ", AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL)::float as avg_duration" : ""}
        FROM job_results
        WHERE job_id=$1
      `;
      const statsRes = await client.query(statsQuery, [job.id]);
      const s = statsRes.rows[0];

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

    res.json({ ok: true, jobs: enrichedJobs });
  } catch (err) {
    console.error("❌ Error fetching jobs:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}
