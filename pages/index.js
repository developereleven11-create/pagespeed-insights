import { useState } from "react";

export default function Home() {
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/).filter(Boolean);
      const parsed = lines.map((url) => ({
        url: url.trim(),
        mobile: {},
        desktop: {},
        status: "Pending",
      }));
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  const fetchMetrics = async (url, strategy, apiKey) => {
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
        url
      )}&strategy=${strategy}&category=performance&key=${apiKey}`
    );
    const data = await res.json();
    const lr = data.lighthouseResult;

    if (!lr) return { error: true };

    const audits = lr.audits;

    return {
      score: lr.categories.performance.score * 100,
      FCP: audits["first-contentful-paint"].displayValue,
      LCP: audits["largest-contentful-paint"].displayValue,
      TBT: audits["total-blocking-time"].displayValue,
      CLS: audits["cumulative-layout-shift"].displayValue,
      SI: audits["speed-index"].displayValue,
      treemap:
        data.analysisUTCTimestamp && data.id
          ? `https://googlechrome.github.io/lighthouse/treemap/?load=${encodeURIComponent(
              `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
                url
              )}&strategy=${strategy}&category=performance&key=${apiKey}`
            )}`
          : "",
    };
  };

  const runPageSpeed = async () => {
    if (running) return;
    setRunning(true);
    const apiKey = process.env.NEXT_PUBLIC_PAGESPEED_API_KEY;
    const updatedRows = [...rows];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      updatedRows[i].status = "Running...";
      setRows([...updatedRows]);

      try {
        const mobileMetrics = await fetchMetrics(row.url, "mobile", apiKey);
        await delay(2000);
        const desktopMetrics = await fetchMetrics(row.url, "desktop", apiKey);

        updatedRows[i] = {
          ...row,
          mobile: mobileMetrics,
          desktop: desktopMetrics,
          status: "✅ Done",
        };
      } catch (err) {
        updatedRows[i].status = "❌ Error";
      }

      setRows([...updatedRows]);
      await delay(2000);
    }

    setRunning(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
        🚀 PageSpeed Insights Dashboard
      </h1>

      <div className="flex justify-center gap-4 mb-6">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="border p-2 rounded bg-white shadow"
        />
        <button
          onClick={runPageSpeed}
          disabled={running || rows.length === 0}
          className={`px-5 py-2 rounded text-white font-semibold shadow ${
            running ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {running ? "Running..." : "Run PageSpeed"}
        </button>
      </div>

      <table className="min-w-full bg-white border shadow text-sm">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="border px-2 py-2">#</th>
            <th className="border px-2 py-2">URL</th>
            <th className="border px-2 py-2">Mobile Score</th>
            <th className="border px-2 py-2">FCP (Mobile)</th>
            <th className="border px-2 py-2">LCP (Mobile)</th>
            <th className="border px-2 py-2">TBT (Mobile)</th>
            <th className="border px-2 py-2">CLS (Mobile)</th>
            <th className="border px-2 py-2">SI (Mobile)</th>
            <th className="border px-2 py-2">Treemap (Mobile)</th>

            <th className="border px-2 py-2">Desktop Score</th>
            <th className="border px-2 py-2">FCP (Desktop)</th>
            <th className="border px-2 py-2">LCP (Desktop)</th>
            <th className="border px-2 py-2">TBT (Desktop)</th>
            <th className="border px-2 py-2">CLS (Desktop)</th>
            <th className="border px-2 py-2">SI (Desktop)</th>
            <th className="border px-2 py-2">Treemap (Desktop)</th>

            <th className="border px-2 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="text-center">
              <td className="border px-2 py-2">{idx + 1}</td>
              <td className="border px-2 py-2 text-blue-600 underline">
                <a href={row.url} target="_blank" rel="noopener noreferrer">
                  {row.url}
                </a>
              </td>

              <td className="border px-2 py-2 font-semibold text-green-700">
                {row.mobile.score || ""}
              </td>
              <td className="border px-2 py-2">{row.mobile.FCP || ""}</td>
              <td className="border px-2 py-2">{row.mobile.LCP || ""}</td>
              <td className="border px-2 py-2">{row.mobile.TBT || ""}</td>
              <td className="border px-2 py-2">{row.mobile.CLS || ""}</td>
              <td className="border px-2 py-2">{row.mobile.SI || ""}</td>
              <td className="border px-2 py-2">
                {row.mobile.treemap && (
                  <a
                    href={row.mobile.treemap}
                    target="_blank"
                    className="text-indigo-600 underline"
                  >
                    View Treemap
                  </a>
                )}
              </td>

              <td className="border px-2 py-2 font-semibold text-green-700">
                {row.desktop.score || ""}
              </td>
              <td className="border px-2 py-2">{row.desktop.FCP || ""}</td>
              <td className="border px-2 py-2">{row.desktop.LCP || ""}</td>
              <td className="border px-2 py-2">{row.desktop.TBT || ""}</td>
              <td className="border px-2 py-2">{row.desktop.CLS || ""}</td>
              <td className="border px-2 py-2">{row.desktop.SI || ""}</td>
              <td className="border px-2 py-2">
                {row.desktop.treemap && (
                  <a
                    href={row.desktop.treemap}
                    target="_blank"
                    className="text-indigo-600 underline"
                  >
                    View Treemap
                  </a>
                )}
              </td>

              <td className="border px-2 py-2">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="text-center mt-6 text-gray-500">
          Upload a CSV with one column of URLs (no header required).
        </p>
      )}
    </div>
  );
}
