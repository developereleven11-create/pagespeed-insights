import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { name, urls } = req.body; // urls = array of domains

  const client = await pool.connect();
  try {
    // Create the job
    const jobInsert = await client.query(
      "INSERT INTO jobs (name, status) VALUES ($1, 'pending') RETURNING id",
      [name]
    );
    const jobId = jobInsert.rows[0].id;

    // Insert all URLs into job_results
    for (const u of urls) {
      await client.query(
        "INSERT INTO job_results (job_id, url, status) VALUES ($1, $2, 'pending')",
        [jobId, u]
      );
    }

    res.json({ ok: true, jobId });
  } catch (err) {
    console.error("Error creating job:", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}
