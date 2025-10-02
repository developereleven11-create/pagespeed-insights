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
        // Expect a column named 'url'
        const validUrls = parsed.data
          .map((row) => row.url)
          .filter((u) => u && u.startsWith("http"));
        setUrls(validUrls);
      },
    });
  };

  const runSequential = async () => {
    setLoading(true);
    const resArr = [];
    for (let i = 0; i < urls.length; i++) {
      try {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urls[i], strategy: "mobile" }),
        });
        const data = await response.json();
        resArr.push({ url: urls[i], data });
        setResults([...resArr]); // update table progressively
      } catch (err) {
        resArr.push({ url: urls[i], error: err.message });
        setResults([...resArr]);
      }
    }
    setLoading(false);
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">PageSpeed Dashboard</h1>

      <input type="file" accept=".csv" onChange={handleFile} className="mb-4" />
      <button
        onClick={runSequential}
        disabled={loading || urls.length === 0}
        className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
      >
        {loading ? "Running..." : "Run PageSpeed"}
      </button>

      <table className="table-auto border-collapse border border-gray-300 w-full">
        <thead>
          <tr>
            <th className="border p-2">URL</th>
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
              <td className="border p-2">{r.data?.lighthouseResult?.categories?.performance?.score ?? r.error}</td>
              <td className="border p-2">{r.data?.lighthouseResult?.audits?.largest-contentful-paint?.displayValue ?? "-"}</td>
              <td className="border p-2">{r.data?.lighthouseResult?.audits?.cumulative-layout-shift?.displayValue ?? "-"}</td>
              <td className="border p-2">{r.data?.lighthouseResult?.audits?.total-blocking-time?.displayValue ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
