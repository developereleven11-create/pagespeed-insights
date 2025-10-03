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

    const enrichedJobs = [];
    for (const job of jobs) {
      const statsRes = await client.query(
        `SELECT 
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE status='done')::int as done,
           COUNT(*) FILTER (WHERE status='error')::int as error,
           COUNT(*) FILTER (WHERE status IN ('pending','running'))::int as remaining,
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

      // Fix progress calc: never 0% if work has started
      let progress = 0;
      if (total > 0) {
        progress = Math.floor((done / total) * 100);
        if (done > 0 && progress === 0) progress = 1;
      }

      // ETA logic
      let eta;
      if (avgDuration && remaining > 0) {
        eta = Math.max(1, Math.round((avgDuration * remaining) / 60000));
      } else if (remaining > 0) {
        eta = "Calculating...";
      } else {
        eta = null;
      }

      enrichedJobs.push({
        ...job,
        total,
        done,
        error,
        remaining,
        progress,
        etaMinutes: eta
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
