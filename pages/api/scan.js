// pages/api/scan.js
// Serverless endpoint: POST { url, strategy }
// Returns: { ok:true, lighthouse: <raw JSON>, metrics: { score, FCP, LCP, TBT, CLS, SI }, filmstrip: [{timing, data}], firstVisibleFrameIndex }

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

    const { url, strategy } = req.body;
    const API_KEY = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    if (!API_KEY) return res.status(500).json({ ok: false, message: "Missing API key in env (GOOGLE_API_KEY)" });

    if (!url || !strategy) return res.status(400).json({ ok: false, message: "Missing url or strategy" });

    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&key=${API_KEY}`;
    const r = await fetch(endpoint);
    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ ok: false, message: "Pagespeed API error", detail: txt });
    }
    const data = await r.json();

    const lr = data.lighthouseResult;
    // safe guards
    const getAudit = (key) => lr?.audits?.[key]?.displayValue ?? null;
    const score = Math.round((lr?.categories?.performance?.score || 0) * 100);

    // filmstrip: take screenshot-thumbnails or filmstrip if available
    const filmstripItems =
      lr?.audits?.["screenshot-thumbnails"]?.details?.items ||
      lr?.audits?.["filmstrip"]?.details?.items ||
      [];

    // Normalize filmstrip items to [{timing, data}]
    const filmstrip = filmstripItems.map((it) => {
      // older items may be objects or strings
      if (typeof it === "string") return { timing: null, data: it };
      return { timing: it.timing ?? it.timestamp ?? null, data: it.data ?? it } ;
    });

    // Heuristic to find first "visible" frame:
    // We cannot run pixel analysis reliably in serverless easily.
    // Heuristic: find first frame with base64 length > threshold (non-empty, not blank thumbnail).
    // Threshold chosen conservatively; adjust if needed.
    const base64Lengths = filmstrip.map(f => (f.data || "").length);
    let firstVisibleFrameIndex = -1;
    const LENGTH_THRESHOLD = 4000; // tweakable: real frames usually much larger than thumbnails from PSI
    for (let i = 0; i < base64Lengths.length; i++) {
      if (base64Lengths[i] > LENGTH_THRESHOLD) {
        firstVisibleFrameIndex = i;
        break;
      }
    }
    // fallback: if none passed threshold, pick last frame if any
    if (firstVisibleFrameIndex === -1 && filmstrip.length > 0) firstVisibleFrameIndex = filmstrip.length - 1;

    const metrics = {
      score,
      FCP: getAudit("first-contentful-paint"),
      LCP: getAudit("largest-contentful-paint"),
      TBT: getAudit("total-blocking-time"),
      CLS: getAudit("cumulative-layout-shift"),
      SI: getAudit("speed-index")
    };

    // Return lighthouse raw data (stringified) so frontend can let user download it for treemap viewer
    res.status(200).json({
      ok: true,
      metrics,
      filmstrip,
      firstVisibleFrameIndex,
      lighthouse: lr ? lr : data  // include the lighthouseResult or the full data
    });

  } catch (err) {
    console.error("API /scan error:", err);
    res.status(500).json({ ok: false, message: "Internal server error", error: String(err) });
  }
}
