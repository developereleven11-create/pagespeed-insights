import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const { id } = req.query;
  const client = await pool.connect();

  try {
    const job = await client.query("SELECT * FROM jobs WHERE id = $1", [id]);
    const results = await client.query("SELECT * FROM job_results WHERE job_id = $1", [id]);
    res.json({ job: job.rows[0], results: results.rows });
  } finally {
    client.release();
  }
}
