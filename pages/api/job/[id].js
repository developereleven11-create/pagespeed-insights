import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  const { id } = req.query;
  const { rows: job } = await sql`SELECT * FROM jobs WHERE id=${id}`;
  const { rows: results } = await sql`SELECT * FROM job_results WHERE job_id=${id}`;
  res.json({ job: job[0], results });
}
