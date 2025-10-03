import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  const {
    query: { id },
  } = req;

  const client = await pool.connect();
  try {
    const jobRes = await client.query("SELECT * FROM jobs WHERE id=$1", [id]);
    if (!jobRes.rowCount) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }
    const job = jobRes.rows[0];

    const resultsRes = await client.query(
      `SELECT id, url, status, 
              COALESCE(desktop, '{}'::jsonb) as desktop,
              COALESCE(mobile, '{}'::jsonb) as mobile
       FROM job_results
       WHERE job_id=$1
       ORDER BY id ASC
       LIMIT 200`, // safety: don’t load thousands at once
      [id]
    );

    res.json({
      job,
      results: resultsRes.rows,
    });
  } catch (err) {
    console.error("Error fetching job", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}
