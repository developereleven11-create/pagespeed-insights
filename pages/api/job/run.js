import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { jobId } = req.body;

  const client = await pool.connect();
  try {
    // Pick one pending URL
    const { rows } = await client.query(
      "SELECT * FROM job_results WHERE job_id = $1 AND status = 'pending' LIMIT 1",
      [jobId]
    );

    if (!rows.length) {
      await client.query("UPDATE jobs SET status = 'done' WHERE id = $1", [jobId]);
      return res.json({ done: true });
    }

    const row = rows[0];
    const url = row.url;
    const API_KEY = process.env.GOOGLE_API_KEY;

    async function runPSI(strategy) {
      const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
        url
      )}&strategy=${strategy}&category=performance&key=${API_KEY}`;
      const r = await fetch(endpoint);
      const json = await r.json();

      const audits = json.lighthouseResult?.audits || {};
      const categories = json.lighthouseResult?.categories || {};

      return {
        score: categories.performance
          ? Math.round(categories.performance.score * 100)
          : null,
        lcp: audits["largest-contentful-paint"]?.displayValue || null,
        fcp: audits["first-contentful-paint"]?.displayValue || null,
        tbt: audits["total-blocking-time"]?.displayValue || null,
        cls: audits["cumulative-layout-shift"]?.displayValue || null,
        filmstrip:
          audits["screenshot-thumbnails"]?.details?.items?.map((i) => ({
            data: i.data,
            timing: i.timing
          })) || []
      };
    }

    const desktop = await runPSI("desktop");
    const mobile = await runPSI("mobile");

    await client.query(
      "UPDATE job_results SET status = 'done', desktop = $1::jsonb, mobile = $2::jsonb WHERE id = $3",
      [JSON.stringify(desktop), JSON.stringify(mobile), row.id]
    );

    res.json({ ok: true, url, desktop, mobile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to run PSI" });
  } finally {
    client.release();
  }
}
