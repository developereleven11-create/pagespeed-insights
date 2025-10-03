import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { name, urls } = req.body; // urls = array of domains

  const { rows } = await sql`
    INSERT INTO jobs (name) VALUES (${name})
    RETURNING id
  `;
  const jobId = rows[0].id;

  for (const u of urls) {
    await sql`
      INSERT INTO job_results (job_id, url)
      VALUES (${jobId}, ${u})
    `;
  }

  res.json({ ok: true, jobId });
}
