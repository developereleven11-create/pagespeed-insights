import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT NOW()");
    res.json({ ok: true, time: result.rows[0].now });
  } finally {
    client.release();
  }
}
