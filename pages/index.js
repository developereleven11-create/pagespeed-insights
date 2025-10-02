import { useState } from "react";
import Papa from "papaparse";

export default function Home() {
  const [urls, setUrls] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFile = (e) => {
    const file = e.target.files[0];
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function (parsed) {
        const validUrls = parsed.data
          .map((row) => row.url)
          .filter((u) => u && u.startsWith("http"));
        setUrls(validUrls);
        setResults([]);
      },
    });
  };

  const runSequential = async () => {
    if (!urls.length) return;
    setLoading(true);
    const resArr = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const rowData = { url };

      for (const strategy of ["mobile", "desktop"]) {
        try {
          const response = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, strategy }),
          });
          const data = await response.json();
          rowData[strategy] = {
            performance: data?.lighthouseResult?.categories?.performance?.score ?? "-",
            LCP: data?.lighthouseResult?.audits?.["largest-contentful-paint"]?.displayValue ?? "-",
            CLS: data?.lighthouseResult?.audits?.["cumulative-layout-shift"]?.displayValue ?? "-",
            TBT: data?.lighthouseResult?.audits?.["total-blocking-time"]?.displayValue ?? "-",
          };
        } catch (err) {
          rowData[strategy] = { performance: "Error", LCP: "-", CLS: "-", TBT: "-" };
        }
      }

      resArr.push(rowData);
      setResults([...resArr]); // update table progressively
    }

    setLoading(false);
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">PageSpeed Dashboard</h1>

      <input
        type="file"
        accept=".csv"
        onChange={handleFile}
        className="mb-4 border p-2"
      />

      <button
        onClick={runSequential}
        disabled={loading || !urls.length}
        className={`mb-4 px-4 py-2 rounded text-white ${loading ? "bg-gray-400" : "bg-blue-500"}`}
      >
        {loading ? "Running..." : "Run PageSpeed"}
      </button>

      <table className="table-auto border-collapse border border-gray-300 w-full">
        <thead>
          <tr>
            <th rowSpan={2} className="border p-2">URL</th>
            <th colSpan={4} className="border p-2">Mobile</th>
            <th colSpan={4} className="border p-2">Desktop</th>
          </tr>
          <tr>
            <th className="border p-2">Performance</th>
            <th className="border p-2">LCP</th>
            <th className="border p-2">CLS</th>
            <th className="border p-2">TBT</th>

            <th className="border p-2">Performance</th>
            <th className="border p-2">LCP</th>
            <th className="border p-2">CLS</th>
            <th className="border p-2">TBT</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, idx) => (
            <tr key={idx}>
              <td className="border p-2">{r.url}</td>

              <td className="border p-2">{r.mobile?.performance ?? "-"}</td>
              <td className="border p-2">{r.mobile?.LCP ?? "-"}</td>
              <td className="border p-2">{r.mobile?.CLS ?? "-"}</td>
              <td className="border p-2">{r.mobile?.TBT ?? "-"}</td>

              <td className="border p-2">{r.desktop?.performance ?? "-"}</td>
              <td className="border p-2">{r.desktop?.LCP ?? "-"}</td>
              <td className="border p-2">{r.desktop?.CLS ?? "-"}</td>
              <td className="border p-2">{r.desktop?.TBT ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
