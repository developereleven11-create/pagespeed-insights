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
        return {
          url: cols[urlIndex].trim(),
          status: "Pending",
        };
      });
      setData(urls);
    };
    reader.readAsText(uploadedFile);
  };

  const runPageSpeed = async () => {
    if (!data.length) return alert("Upload a CSV first!");
    setLoading(true);

    const updated = [...data];
    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      updated[i].status = "Running...";
      setData([...updated]);

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

        updated[i] = {
          ...item,
          status: "Completed",
          desktop: {
            score: getScore(desktopRes),
            lcp: getMetric(desktopRes, "largest-contentful-paint"),
            fcp: getMetric(desktopRes, "first-contentful-paint"),
            tbt: getMetric(desktopRes, "total-blocking-time"),
            cls: getMetric(desktopRes, "cumulative-layout-shift"),
          },
          mobile: {
            score: getScore(mobileRes),
            lcp: getMetric(mobileRes, "largest-contentful-paint"),
            fcp: getMetric(mobileRes, "first-contentful-paint"),
            tbt: getMetric(mobileRes, "total-blocking-time"),
            cls: getMetric(mobileRes, "cumulative-layout-shift"),
          },
        };
      } catch (err) {
        updated[i].status = "Error";
      }

      setData([...updated]); // live update row
    }

    setLoading(false);
  };

  const getTreemapLink = (url, strategy) => {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      url
    )}&strategy=${strategy}&category=performance`;
    const treemapUrl = `https://googlechrome.github.io/lighthouse/treemap/?load=${encodeURIComponent(
      apiUrl
    )}`;
    return treemapUrl;
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-72 bg-white shadow-lg p-4 overflow-y-auto border-r border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Domains</h2>
        {data.length === 0 && (
          <p className="text-gray-500 text-sm">Upload a CSV to see domains</p>
        )}
        <ul>
          {data.map((item, idx) => (
            <li key={idx} className="mb-3">
              <p className="text-sm font-medium truncate">{item.url}</p>
              {item.status === "Completed" && (
                <div className="flex gap-2 mt-1">
                  <a
                    href={getTreemapLink(item.url, "desktop")}
                    target="_blank"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Desktop Treemap
                  </a>
                  <a
                    href={getTreemapLink(item.url, "mobile")}
                    target="_blank"
                    className="text-xs text-green-600 hover:underline"
                  >
                    Mobile Treemap
                  </a>
                </div>
              )}
              <span
                className={`text-xs ${
                  item.status === "Completed"
                    ? "text-green-600"
                    : item.status === "Error"
                    ? "text-red-500"
                    : item.status === "Running..."
                    ? "text-yellow-600"
                    : "text-gray-500"
                }`}
              >
                {item.status}
              </span>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main Dashboard */}
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">
            PageSpeed Insights Dashboard
          </h1>

          <div className="bg-white p-6 rounded-lg shadow mb-8">
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

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-gray-200">
                <tr>
                  <th className="p-3">URL</th>
                  <th className="p-3 text-center">Status</th>
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
                    <td className="p-3 text-center">{item.status}</td>
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
