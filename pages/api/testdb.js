import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false } // Neon requires SSL
});

export default async function handler(req, res) {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW() as time");
    client.release();
    res.status(200).json({ ok: true, time: result.rows[0].time });
  } catch (err) {
    console.error("DB connection error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
