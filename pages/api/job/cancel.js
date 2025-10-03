import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { jobId } = req.body;
  if (!jobId) {
    return res.status(400).json({ ok: false, error: "Missing jobId" });
  }

  const client = await pool.connect();
  try {
    // mark job as cancelled
    await client.query(
      `UPDATE jobs SET status='cancelled' WHERE id=$1`,
      [jobId]
    );

    // mark all unfinished rows as cancelled too
    await client.query(
      `UPDATE job_results 
       SET status='cancelled', completed_at=NOW()
       WHERE job_id=$1 AND status IN ('pending','running')`,
      [jobId]
    );

    res.json({ ok: true, message: `Job ${jobId} cancelled.` });
  } catch (err) {
    console.error("Cancel job error:", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}
