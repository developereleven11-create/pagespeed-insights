import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { name, urls } = req.body;
  if (!urls?.length) return res.status(400).json({ ok: false, error: "No URLs provided" });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const jobInsert = await client.query(
      "INSERT INTO jobs (name, status) VALUES ($1, 'pending') RETURNING id",
      [name]
    );
    const jobId = jobInsert.rows[0].id;

    const values = urls.map((u, i) => `(${jobId}, $${i + 1}, 'pending')`).join(",");
    await client.query(`INSERT INTO job_results (job_id, url, status)
      VALUES ${urls.map((_, i) => `($1, $${i + 2}, 'pending')`).join(", ")}`, [jobId, ...urls]);

    await client.query("COMMIT");
    res.json({ ok: true, jobId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error creating job:", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}
