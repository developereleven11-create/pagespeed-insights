# PageSpeed Dashboard (Next.js + Vercel)

Deploy instructions:
1. Create a Google Cloud API key and enable PageSpeed Insights API.
2. In Vercel (or locally), set environment variable `GOOGLE_API_KEY`.
3. Deploy this repo to GitHub and connect to Vercel.
4. `npm install` then `npm run dev` locally.

Features:
- Upload CSV of URLs (column header must be `url` or single column).
- Fetches PageSpeed Insights (mobile & desktop) for each URL.
- Displays key metrics and available screenshots/filmstrip frames.
- Treemap visualization screen shows filmstrip frames (if returned).

Notes & caveats:
- Vercel has execution time limits for serverless functions. For large CSVs (thousands of URLs) consider:
  - Breaking into batches.
  - Running a server or using background jobs / queue.
  - Or use the script version instead (local script).
- API key quota limits apply (default generous but finite).
