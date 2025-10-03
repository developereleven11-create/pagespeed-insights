import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    const jobs = await client.query("SELECT * FROM jobs ORDER BY created_at DESC");
    res.json({ jobs: jobs.rows });
  } finally {
    client.release();
  }
}
