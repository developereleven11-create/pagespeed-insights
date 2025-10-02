export default async function handler(req, res) {
  try {
    const { url, strategy } = req.body;

    if (!url) {
      return res.status(400).json({ error: "Missing URL" });
    }

    const apiKey = process.env.GOOGLE_API_KEY;

    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      url
    )}&strategy=${strategy || "mobile"}&key=${apiKey}`;

    // ✅ Use built-in fetch (no need for node-fetch)
    const response = await fetch(apiUrl);
    const data = await response.json();

    res.status(200).json(data);
  } catch (error) {
    console.error("Error in /api/scan:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
