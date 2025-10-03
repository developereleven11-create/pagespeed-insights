import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    // Get all jobs
    const jobsRes = await client.query(
      "SELECT * FROM jobs ORDER BY created_at DESC"
    );
    const jobs = jobsRes.rows;

    // For each job, compute metrics
    const enrichedJobs = [];
    for (const job of jobs) {
      const statsRes = await client.query(
        `SELECT 
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE status='done')::int as done,
           COUNT(*) FILTER (WHERE status='error')::int as error,
           COUNT(*) FILTER (WHERE status='pending' OR status='running')::int as remaining,
           AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL)::float as avg_duration
         FROM job_results
         WHERE job_id=$1`,
        [job.id]
      );

      const s = statsRes.rows[0];
      const total = s.total || 0;
      const done = s.done || 0;
      const error = s.error || 0;
      const remaining = s.remaining || 0;
      const avgDuration = s.avg_duration || 0;

      const progress = total > 0 ? Math.round((done / total) * 100) : 0;
      const etaMinutes = avgDuration && remaining
        ? Math.round((avgDuration * remaining) / 60000)
        : null;

      enrichedJobs.push({
        ...job,
        total,
        done,
        error,
        remaining,
        progress,
        etaMinutes
      });
    }

    res.json({ jobs: enrichedJobs });
  } catch (err) {
    console.error("Error fetching jobs:", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}
