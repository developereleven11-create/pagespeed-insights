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
    const jobInsert = await client.query(
      "INSERT INTO jobs (name) VALUES ($1) RETURNING id",
      [name]
    );
    const jobId = jobInsert.rows[0].id;

    for (const u of urls) {
      await client.query(
        "INSERT INTO job_results (job_id, url) VALUES ($1, $2)",
        [jobId, u]
      );
    }

    res.json({ ok: true, jobId });
  } finally {
    client.release();
  }
}
