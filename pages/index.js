import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    setFile(uploadedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split("\n").filter(Boolean);
      const headers = rows[0].split(",").map((h) => h.trim());
      const urlIndex = headers.findIndex((h) => h.toLowerCase() === "urls");
      if (urlIndex === -1) {
        alert("CSV must have a column named 'URLs'");
        return;
      }
      const urls = rows.slice(1).map((r) => {
        const cols = r.split(",");
        return { url: cols[urlIndex].trim() };
      });
      setData(urls);
    };
    reader.readAsText(uploadedFile);
  };

  const runPageSpeed = async () => {
    if (!data.length) return alert("Upload a CSV first!");
    setLoading(true);

    const updatedData = [];
    for (const item of data) {
      try {
        const desktopRes = await fetch(
          `/api/scan?url=${encodeURIComponent(item.url)}&strategy=desktop`
        ).then((res) => res.json());
        const mobileRes = await fetch(
          `/api/scan?url=${encodeURIComponent(item.url)}&strategy=mobile`
        ).then((res) => res.json());

        const getMetric = (res, key) =>
          res?.lighthouseResult?.audits?.[key]?.displayValue || "N/A";
        const getScore = (res) =>
          Math.round((res?.lighthouseResult?.categories?.performance?.score || 0) * 100);

        updatedData.push({
          url: item.url,
          desktop: {
            score: getScore(desktopRes),
            lcp: getMetric(desktopRes, "largest-contentful-paint"),
            fcp: getMetric(desktopRes, "first-contentful-paint"),
            tbt: getMetric(desktopRes, "total-blocking-time"),
            cls: getMetric(desktopRes, "cumulative-layout-shift"),
            screenshot:
              desktopRes?.lighthouseResult?.audits["final-screenshot"]?.details?.data || null,
          },
          mobile: {
            score: getScore(mobileRes),
            lcp: getMetric(mobileRes, "largest-contentful-paint"),
            fcp: getMetric(mobileRes, "first-contentful-paint"),
            tbt: getMetric(mobileRes, "total-blocking-time"),
            cls: getMetric(mobileRes, "cumulative-layout-shift"),
            screenshot:
              mobileRes?.lighthouseResult?.audits["final-screenshot"]?.details?.data || null,
          },
        });
        setData([...updatedData]); // live updates
      } catch (err) {
        console.error(err);
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-lg p-4 overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Treemap Screenshots</h2>
        {data.map(
          (item, idx) =>
            (item.desktop?.screenshot || item.mobile?.screenshot) && (
              <div key={idx} className="mb-6">
                <h3 className="text-sm font-bold truncate">{item.url}</h3>
                {item.desktop?.screenshot && (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-gray-500">Desktop</p>
                    <img
                      src={item.desktop.screenshot}
                      alt="Desktop Screenshot"
                      className="w-full rounded-md border"
                    />
                  </div>
                )}
                {item.mobile?.screenshot && (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-gray-500">Mobile</p>
                    <img
                      src={item.mobile.screenshot}
                      alt="Mobile Screenshot"
                      className="w-full rounded-md border"
                    />
                  </div>
                )}
              </div>
            )
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">PageSpeed Insights Dashboard</h1>

          <div className="bg-white shadow rounded-lg p-6 mb-8">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="mb-4"
            />
            <button
              onClick={runPageSpeed}
              disabled={loading}
              className={`px-6 py-2 rounded-md text-white ${
                loading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? "Running..." : "Run PageSpeed"}
            </button>
          </div>

          <div className="bg-white shadow rounded-lg overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-gray-200">
                <tr>
                  <th className="p-3">URL</th>
                  <th className="p-3 text-center">Desktop Score</th>
                  <th className="p-3">LCP</th>
                  <th className="p-3">FCP</th>
                  <th className="p-3">TBT</th>
                  <th className="p-3">CLS</th>
                  <th className="p-3 text-center">Mobile Score</th>
                  <th className="p-3">LCP</th>
                  <th className="p-3">FCP</th>
                  <th className="p-3">TBT</th>
                  <th className="p-3">CLS</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="p-3 truncate max-w-xs">{item.url}</td>
                    <td className="p-3 text-center font-bold">
                      {item.desktop?.score ?? "-"}
                    </td>
                    <td className="p-3">{item.desktop?.lcp ?? "-"}</td>
                    <td className="p-3">{item.desktop?.fcp ?? "-"}</td>
                    <td className="p-3">{item.desktop?.tbt ?? "-"}</td>
                    <td className="p-3">{item.desktop?.cls ?? "-"}</td>
                    <td className="p-3 text-center font-bold">
                      {item.mobile?.score ?? "-"}
                    </td>
                    <td className="p-3">{item.mobile?.lcp ?? "-"}</td>
                    <td className="p-3">{item.mobile?.fcp ?? "-"}</td>
                    <td className="p-3">{item.mobile?.tbt ?? "-"}</td>
                    <td className="p-3">{item.mobile?.cls ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
