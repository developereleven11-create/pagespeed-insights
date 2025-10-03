import { useState, useEffect } from "react";

// Helper for badge colors
const scoreColor = (score) => {
  if (score === null || score === undefined) return "bg-gray-300 text-gray-800";
  if (score >= 90) return "bg-green-500 text-white";
  if (score >= 50) return "bg-yellow-500 text-white";
  return "bg-red-500 text-white";
};

export default function Dashboard() {
  const [urls, setUrls] = useState([]);
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [selected, setSelected] = useState(null);
  const [drawerTab, setDrawerTab] = useState("filmstrip");

  // CSV parser
  function parseCSVText(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].toLowerCase();
    let urls = [];
    if (header.includes("url")) {
      urls = lines.slice(1).map((l) => l.split(",")[0].trim());
    } else {
      urls = lines;
    }
    urls = urls.map((u) => (u.startsWith("http") ? u : "https://" + u));
    return [...new Set(urls)];
  }

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSVText(ev.target.result);
      setUrls(parsed);
      setProgress({ done: 0, total: parsed.length * 2 });
    };
    reader.readAsText(file);
  };

  async function callScan(url, strategy) {
    const resp = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, strategy }),
    });
    return await resp.json();
  }

  const runAllSequential = async () => {
    if (!urls.length) return alert("Upload CSV first");
    setRunning(true);
    const newResults = { ...results };
    let doneCount = 0;
    for (let url of urls) {
      newResults[url] = { status: "Running" };
      setResults({ ...newResults });

      try {
        const mobile = await callScan(url, "mobile");
        const desktop = await callScan(url, "desktop");

        newResults[url] = {
          status: "Done",
          mobile,
          desktop,
        };
      } catch (err) {
        console.error("Error scanning", url, err);
        newResults[url] = { status: "Error" };
      }
      doneCount += 2;
      setProgress({ done: doneCount, total: urls.length * 2 });
      setResults({ ...newResults });
    }
    setRunning(false);
  };

  const selectedResult = selected ? results[selected] : null;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Bar */}
      <div className="bg-white shadow px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">PageSpeed Dashboard</h1>
        <div className="flex gap-4">
          <input type="file" accept=".csv" onChange={handleFile} />
          <button
            onClick={runAllSequential}
            disabled={running}
            className={`px-4 py-2 rounded text-white ${
              running ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {running
              ? `Running... (${progress.done}/${progress.total})`
              : "Run PageSpeed"}
          </button>
        </div>
      </div>

      {/* Grid of Cards */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {urls.map((url) => {
          const r = results[url];
          const desktopScore = r?.desktop?.metrics?.score ?? null;
          const mobileScore = r?.mobile?.metrics?.score ?? null;
          return (
            <div
              key={url}
              className="bg-white rounded-lg shadow p-4 flex flex-col justify-between"
            >
              <div>
                <h2 className="font-semibold truncate">{url}</h2>
                <span
                  className={`inline-block px-2 py-1 text-xs rounded ${
                    r?.status === "Done"
                      ? "bg-green-100 text-green-700"
                      : r?.status === "Running"
                      ? "bg-yellow-100 text-yellow-700"
                      : r?.status === "Error"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {r?.status || "Pending"}
                </span>
              </div>
              <div className="flex gap-4 my-4">
                <div
                  className={`w-12 h-12 flex items-center justify-center rounded-full text-lg font-bold ${scoreColor(
                    desktopScore
                  )}`}
                >
                  {desktopScore ?? "--"}
                </div>
                <div
                  className={`w-12 h-12 flex items-center justify-center rounded-full text-lg font-bold ${scoreColor(
                    mobileScore
                  )}`}
                >
                  {mobileScore ?? "--"}
                </div>
              </div>
              <div className="text-sm text-gray-700 mt-2">
  {r?.desktop?.metrics && (
    <div>
      <p className="font-semibold">Desktop</p>
      <p>LCP: {r.desktop.metrics.LCP}</p>
      <p>FCP: {r.desktop.metrics.FCP}</p>
      <p>TBT: {r.desktop.metrics.TBT}</p>
      <p>CLS: {r.desktop.metrics.CLS}</p>
    </div>
  )}
  {r?.mobile?.metrics && (
    <div className="mt-2">
      <p className="font-semibold">Mobile</p>
      <p>LCP: {r.mobile.metrics.LCP}</p>
      <p>FCP: {r.mobile.metrics.FCP}</p>
      <p>TBT: {r.mobile.metrics.TBT}</p>
      <p>CLS: {r.mobile.metrics.CLS}</p>
    </div>
  )}
</div>

              <div className="flex gap-2 mt-4">
                <button
                  className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                  onClick={() => setSelected(url)}
                >
                  Details
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drawer */}
      {selected && selectedResult && (
        <div className="fixed top-0 right-0 w-full sm:w-[480px] h-full bg-white shadow-lg overflow-y-auto transition-all">
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="text-lg font-bold">{selected}</h2>
            <button
              className="text-gray-500 hover:text-gray-800"
              onClick={() => setSelected(null)}
            >
              ✕
            </button>
          </div>
          {/* Tabs */}
          <div className="flex border-b">
            {["filmstrip", "metrics", "treemap"].map((tab) => (
              <button
                key={tab}
                className={`flex-1 py-2 ${
                  drawerTab === tab
                    ? "border-b-2 border-blue-600 font-semibold"
                    : "text-gray-500"
                }`}
                onClick={() => setDrawerTab(tab)}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="p-4">
            {drawerTab === "filmstrip" && (
              <>
                <h3 className="font-semibold mb-2">Filmstrip (Desktop)</h3>
                <div className="flex gap-2 overflow-x-auto">
                  {selectedResult.desktop?.filmstrip?.map((f, i) => (
                    <img
                      key={i}
                      src={f.data}
                      alt={`frame ${i}`}
                      className={`w-32 border ${
                        i === selectedResult.desktop.firstVisibleFrameIndex
                          ? "border-green-500 border-4"
                          : "border-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <h3 className="font-semibold mt-4 mb-2">Filmstrip (Mobile)</h3>
                <div className="flex gap-2 overflow-x-auto">
                  {selectedResult.mobile?.filmstrip?.map((f, i) => (
                    <img
                      key={i}
                      src={f.data}
                      alt={`frame ${i}`}
                      className={`w-24 border ${
                        i === selectedResult.mobile.firstVisibleFrameIndex
                          ? "border-green-500 border-4"
                          : "border-gray-300"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
            {drawerTab === "metrics" && (
              <div>
                <h3 className="font-semibold">Desktop Metrics</h3>
                <pre className="bg-gray-100 p-2 rounded text-sm">
                  {JSON.stringify(selectedResult.desktop?.metrics, null, 2)}
                </pre>
                <h3 className="font-semibold mt-4">Mobile Metrics</h3>
                <pre className="bg-gray-100 p-2 rounded text-sm">
                  {JSON.stringify(selectedResult.mobile?.metrics, null, 2)}
                </pre>
              </div>
            )}
            {drawerTab === "treemap" && (
              <iframe
                title="Treemap"
                src={`https://googlechrome.github.io/lighthouse/treemap/`}
                className="w-full h-[600px] border"
              ></iframe>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
