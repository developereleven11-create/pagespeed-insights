import { useState } from "react";
import Papa from "papaparse";

export default function Home() {
  const [urls, setUrls] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleFile = (e) => {
    const file = e.target.files[0];
    Papa.parse(file, {
      header: true, // CSV has header row
      skipEmptyLines: true,
      complete: function (parsed) {
        let validUrls = parsed.data
          .map((row) => row.URLS)
          .filter((u) => u && u.startsWith("http"));

        if (validUrls.length === 0) {
          Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: function (parsed2) {
              validUrls = parsed2.data
                .map((row) => row[0])
                .filter((u) => u && u.startsWith("http"));
              setUrls(validUrls);
              setResults(validUrls.map((u) => ({ url: u, status: "Pending" })));
            },
          });
        } else {
          setUrls(validUrls);
          setResults(validUrls.map((u) => ({ url: u, status: "Pending" })));
        }
      },
    });
  };

  const runSequential = async () => {
    if (!urls.length) return;
    setLoading(true);
    const resArr = [...results];

    for (let i = 0; i < urls.length; i++) {
      setCurrentIndex(i);
      resArr[i].status = "Running";
      setResults([...resArr]);

      const rowData = { url: urls[i] };

      for (const strategy of ["mobile", "desktop"]) {
        try {
          const response = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: urls[i], strategy }),
          });
          const data = await response.json();
          rowData[strategy] = {
            performance:
              data?.lighthouseResult?.categories?.performance?.score ?? "-",
            LCP:
              data?.lighthouseResult?.audits?.["largest-contentful-paint"]
                ?.displayValue ?? "-",
            CLS:
              data?.lighthouseResult?.audits?.["cumulative-layout-shift"]
                ?.displayValue ?? "-",
            TBT:
              data?.lighthouseResult?.audits?.["total-blocking-time"]
                ?.displayValue ?? "-",
          };
        } catch (err) {
          rowData[strategy] = { performance: "Error", LCP: "-", CLS: "-", TBT: "-" };
        }
      }

      rowData.status = "Done";
      resArr[i] = rowData;
      setResults([...resArr]);
    }

    setLoading(false);
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center text-blue-700">
        PageSpeed Insights Dashboard
      </h1>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="border rounded p-2 w-full md:w-1/2"
        />
        <button
          onClick={runSequential}
          disabled={loading || !urls.length}
          className={`px-6 py-2 rounded text-white font-semibold transition-colors ${
            loading || !urls.length
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {loading ? "Running..." : "Run PageSpeed"}
        </button>
      </div>

      {loading && (
        <div className="mb-4">
          <div className="w-full bg-gray-300 rounded h-4">
            <div
              className="bg-green-500 h-4 rounded transition-all"
              style={{ width: `${((currentIndex + 1) / urls.length) * 100}%` }}
            ></div>
          </div>
          <p className="mt-2 text-gray-700">
            Processing URL {currentIndex + 1} of {urls.length}
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-300 rounded shadow">
          <thead className="bg-blue-100">
            <tr>
              <th className="border p-2">URL</th>
              <th className="border p-2">Status</th>
              <th colSpan={4} className="border p-2">Mobile</th>
              <th colSpan={4} className="border p-2">Desktop</th>
            </tr>
            <tr className="bg-blue-50">
              <th className="border p-2"></th>
              <th className="border p-2"></th>
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
              <tr
                key={idx}
                className={idx % 2 === 0 ? "bg-gray-50" : "bg-white hover:bg-gray-100"}
              >
                <td className="border p-2 break-words">{r.url}</td>
                <td className="border p-2 font-semibold">
                  {r.status ?? "Pending"}
                </td>

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
    </div>
  );
}
