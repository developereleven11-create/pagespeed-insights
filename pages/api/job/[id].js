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

    // fetch results
    const resultsRes = await client.query(
      `SELECT id, url, status,
              COALESCE(desktop, '{}'::jsonb) as desktop,
              COALESCE(mobile, '{}'::jsonb) as mobile
       FROM job_results
       WHERE job_id=$1
       ORDER BY id ASC
       LIMIT 200`, // keep it light
      [id]
    );

    // parse JSON (Neon returns jsonb as string in node-pg)
    const results = resultsRes.rows.map((r) => ({
      ...r,
      desktop: typeof r.desktop === "string" ? JSON.parse(r.desktop) : r.desktop,
      mobile: typeof r.mobile === "string" ? JSON.parse(r.mobile) : r.mobile,
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
