import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { jobId } = req.body;

  const { rows } = await sql`
    SELECT * FROM job_results 
    WHERE job_id = ${jobId} AND status = 'pending'
    LIMIT 1
  `;
  if (!rows.length) {
    await sql`UPDATE jobs SET status='done' WHERE id=${jobId}`;
    return res.json({ done: true });
  }

  const row = rows[0];
  const url = row.url;
  const API_KEY = process.env.GOOGLE_API_KEY;

  async function runPSI(strategy) {
    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&key=${API_KEY}`;
    const r = await fetch(endpoint);
    return await r.json();
  }

  const desktop = await runPSI("desktop");
  const mobile = await runPSI("mobile");

  await sql`
    UPDATE job_results 
    SET status='done', desktop=${desktop}, mobile=${mobile}
    WHERE id=${row.id}
  `;

  res.json({ ok: true, url });
}
