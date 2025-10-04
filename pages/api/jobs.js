// /pages/api/jobs.js
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export default async function handler(req, res) {
  try {
    // simple pagination
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const perPage = Math.max(10, Math.min(100, parseInt(req.query.perPage || "20", 10)));
    const offset = (page - 1) * perPage;

    // Query: fetch jobs with counts using safe aggregates (handles missing job_results gracefully)
    const jobsQuery = `
      SELECT
        j.id,
        j.name,
        j.status,
        j.created_at,
        COALESCE(sub.total, 0) AS total,
        COALESCE(sub.pending, 0) AS pending,
        COALESCE(sub.completed, 0) AS completed,
        COALESCE(sub.failed, 0) AS failed,
        COALESCE(sub.avg_duration_ms, 0) AS avg_duration_ms
      FROM jobs j
      LEFT JOIN (
        SELECT
          job_id,
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
          AVG(duration_ms) AS avg_duration_ms
        FROM job_results
        GROUP BY job_id
      ) sub ON sub.job_id = j.id
      ORDER BY j.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const { rows } = await pool.query(jobsQuery, [perPage, offset]);

    // total jobs count for UI
    const totalRes = await pool.query("SELECT COUNT(*)::int AS count FROM jobs");
    const totalJobs = totalRes.rows?.[0]?.count || 0;

    res.status(200).json({
      ok: true,
      data: rows,
      meta: {
        page,
        perPage,
        totalJobs,
      },
    });
  } catch (err) {
    console.error("API /api/jobs error:", err);
    res.status(500).json({ ok: false, error: "Internal Server Error", detail: err.message });
  }
}
