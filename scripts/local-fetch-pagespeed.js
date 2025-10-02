// Optional: Node script for local bulk runs (no serverless limits).
// Usage: GOOGLE_API_KEY=xxx node scripts/local-fetch-pagespeed.js input.csv output.json
const fs = require('fs')
const Papa = require('papaparse')
const fetch = require('node-fetch')

const apiKey = process.env.GOOGLE_API_KEY
if (!apiKey) {
  console.error('Set GOOGLE_API_KEY env var')
  process.exit(1)
}
const [,, input, output] = process.argv
if (!input || !output) {
  console.error('Usage: node local-fetch-pagespeed.js input.csv output.json')
  process.exit(1)
}
const raw = fs.readFileSync(input, 'utf8')
const parsed = Papa.parse(raw, { header: true })
const rows = parsed.data
const urls = rows.map(r => r.url || Object.values(r)[0]).filter(Boolean)

async function callPSI(url, strategy='mobile') {
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&key=${apiKey}`
  const res = await fetch(endpoint)
  const data = await res.json()
  return data
}

;(async () => {
  const out = []
  for (const u of urls) {
    console.log('Fetching', u)
    const m = await callPSI(u, 'mobile')
    out.push({ url: u, strategy: 'mobile', data: m })
    await new Promise(r => setTimeout(r, 1100))
    const d = await callPSI(u, 'desktop')
    out.push({ url: u, strategy: 'desktop', data: d })
    await new Promise(r => setTimeout(r, 1100))
  }
  fs.writeFileSync(output, JSON.stringify(out, null, 2))
  console.log('Done ->', output)
})()
