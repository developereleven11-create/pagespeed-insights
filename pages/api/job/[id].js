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
    // fetch job meta
    const jobRes = await client.query("SELECT * FROM jobs WHERE id=$1", [id]);
    if (!jobRes.rowCount) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }
    const job = jobRes.rows[0];

    // fetch results (force jsonb → text to avoid node-pg quirks)
    const resultsRes = await client.query(
      `SELECT id, url, status,
              desktop::text as desktop,
              mobile::text as mobile
       FROM job_results
       WHERE job_id=$1
       ORDER BY id ASC
       LIMIT 200`,
      [id]
    );

    const results = resultsRes.rows.map((r) => ({
      ...r,
      desktop: r.desktop ? JSON.parse(r.desktop) : {},
      mobile: r.mobile ? JSON.parse(r.mobile) : {},
    }));

    res.json({
      job,
      results,
    });
  } catch (err) {
    console.error("Error fetching job details:", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}
