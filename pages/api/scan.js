// Serverless API to fetch PageSpeed Insights for given URLs (mobile + desktop).
// Expects POST JSON: { urls: ["https://example.com", ...] }
// Requires env var GOOGLE_API_KEY
import fetch from 'node-fetch'

const API_KEY = process.env.GOOGLE_API_KEY
const DELAY_MS = 1100  // simple rate-limit delay

async function callPSI(url, strategy='mobile') {
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&key=${API_KEY}`
  const res = await fetch(endpoint)
  if (!res.ok) {
    const text = await res.text()
    throw new Error('PSI error: ' + text)
  }
  const data = await res.json()
  const lh = data.lighthouseResult
  const audits = lh?.audits || {}
  // helpers to safely extract numeric values
  const performance = Math.round((lh?.categories?.performance?.score || 0) * 100)
  const lcp = audits['largest-contentful-paint']?.displayValue || null
  const cls = audits['cumulative-layout-shift']?.displayValue || null
  const tbt = audits['total-blocking-time']?.displayValue || null
  const fcp = audits['first-contentful-paint']?.displayValue || null
  // final-screenshot might exist
  const screenshot = audits['final-screenshot']?.details?.data || null
  // filmstrip frames if available
  const filmstrip = audits['filmstrip']?.details?.items || audits['screenshot-thumbnails']?.details?.items || null
  const filmstripCount = Array.isArray(filmstrip) ? filmstrip.length : (data?.audits?.['screenshot-thumbnails']?.details?.items?.length || 0)

  return {
    url,
    strategy,
    performance,
    lcp,
    cls,
    tbt,
    fcp,
    screenshot,
    filmstripCount
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  if (!API_KEY) return res.status(500).json({ message: 'GOOGLE_API_KEY is not set in environment' })

  const { urls } = req.body
  if (!urls || !Array.isArray(urls)) return res.status(400).json({ message: 'Invalid payload. Expect { urls: [] }' })

  const results = []

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    try {
      // mobile
      const mobile = await callPSI(url, 'mobile')
      results.push(mobile)
    } catch (err) {
      results.push({ url, strategy: 'mobile', error: String(err) })
    }
    // delay between requests to avoid quota/rate-limit spikes
    await new Promise(r => setTimeout(r, DELAY_MS))
    try {
      // desktop
      const desktop = await callPSI(url, 'desktop')
      results.push(desktop)
    } catch (err) {
      results.push({ url, strategy: 'desktop', error: String(err) })
    }
    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  res.status(200).json(results)
}
