import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  const { id, offset = 0, limit = 200 } = req.query;
  const client = await pool.connect();

  try {
    const jobRes = await client.query("SELECT * FROM jobs WHERE id = $1", [id]);
    if (!jobRes.rowCount)
      return res.status(404).json({ ok: false, error: "Job not found" });
    const job = jobRes.rows[0];

    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);

    const resultsRes = await client.query(
      `SELECT id, url, status,
              desktop::text AS desktop,
              mobile::text AS mobile
       FROM job_results
       WHERE job_id = $1
       ORDER BY id ASC
       OFFSET $2 LIMIT $3`,
      [id, safeOffset, safeLimit]
    );

    const results = resultsRes.rows.map((r) => ({
      ...r,
      desktop: r.desktop ? JSON.parse(r.desktop) : {},
      mobile: r.mobile ? JSON.parse(r.mobile) : {},
    }));

    const totalRes = await client.query(
      "SELECT COUNT(*) FROM job_results WHERE job_id = $1",
      [id]
    );
    const total = parseInt(totalRes.rows[0].count, 10);

    res.json({
      ok: true,
      job,
      results,
      pagination: {
        total,
        offset: safeOffset,
        limit: safeLimit,
        hasMore: safeOffset + results.length < total,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching job details:", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}
