import { useState, useEffect } from "react";

export default function Dashboard() {
  const [urls, setUrls] = useState([]);
  const [results, setResults] = useState({});
  const [selected, setSelected] = useState(null);
  const [running, setRunning] = useState(false);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("results");
    if (stored) setResults(JSON.parse(stored));
    const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    if (key) setApiKey(key);
  }, []);

  const handleFile = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const lines = event.target.result.split("\n").map((l) => l.trim()).filter(Boolean);
      const clean = lines.slice(1).map((line) => line.replace(/['"]+/g, ""));
      setUrls(clean);
    };
    reader.readAsText(file);
  };

  const runTests = async () => {
    if (!apiKey) return alert("Missing API key!");
    setRunning(true);

    let newResults = { ...results };
    for (let url of urls) {
      if (newResults[url]) continue;
      try {
        const desktop = await fetchReport(url, "desktop");
        const mobile = await fetchReport(url, "mobile");
        newResults[url] = { desktop, mobile };
        setResults({ ...newResults });
        localStorage.setItem("results", JSON.stringify(newResults));
      } catch (e) {
        console.error("Error fetching", url, e);
      }
      await new Promise((r) => setTimeout(r, 3000)); // delay
    }
    setRunning(false);
  };

  const fetchReport = async (url, strategy) => {
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
        url
      )}&strategy=${strategy}&key=${apiKey}`
    );
    const data = await res.json();
    const audits = data.lighthouseResult?.audits || {};
    return {
      FCP: audits["first-contentful-paint"]?.displayValue || "N/A",
      LCP: audits["largest-contentful-paint"]?.displayValue || "N/A",
      TBT: audits["total-blocking-time"]?.displayValue || "N/A",
      CLS: audits["cumulative-layout-shift"]?.displayValue || "N/A",
      SpeedIndex: audits["speed-index"]?.displayValue || "N/A",
      screenshot: audits["final-screenshot"]?.details?.data || null,
      treemap: data.lighthouseResult?.fullPageScreenshot?.screenshot?.data || null,
    };
  };

  return (
    <div className="flex h-screen font-sans bg-gray-100">
      {/* Sidebar */}
      <div className="w-1/4 bg-white border-r overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">Domains</h2>
          <input type="file" accept=".csv" className="mt-3" onChange={handleFile} />
          <button
            onClick={runTests}
            disabled={running || urls.length === 0}
            className={`mt-3 w-full py-2 rounded ${
              running ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
            } text-white font-semibold`}
          >
            {running ? "Running..." : "Run PageSpeed"}
          </button>
        </div>
        <ul>
          {Object.keys(results).map((url) => (
            <li
              key={url}
              onClick={() => setSelected(url)}
              className={`p-3 cursor-pointer hover:bg-blue-50 ${
                selected === url ? "bg-blue-100 font-semibold" : ""
              }`}
            >
              {url}
            </li>
          ))}
        </ul>
      </div>

      {/* Main Panel */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selected ? (
          <div className="text-gray-500 text-center mt-20">Select a domain from the sidebar</div>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-4">{selected}</h2>
            <div className="grid grid-cols-2 gap-6">
              {["desktop", "mobile"].map((type) => (
                <div key={type} className="bg-white shadow rounded-lg p-4">
                  <h3 className="text-lg font-semibold capitalize mb-3">{type}</h3>
                  {results[selected]?.[type] ? (
                    <>
                      <ul className="text-sm space-y-2">
                        {Object.entries(results[selected][type])
                          .filter(([key]) => key !== "screenshot" && key !== "treemap")
                          .map(([metric, value]) => (
                            <li key={metric} className="flex justify-between">
                              <span className="font-medium">{metric}</span>
                              <span>{value}</span>
                            </li>
                          ))}
                      </ul>
                      <div className="mt-4">
                        {results[selected][type].treemap && (
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Treemap Screenshot</h4>
                            <img
                              src={results[selected][type].treemap}
                              alt="Treemap"
                              className="rounded-lg border"
                            />
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-400">No data</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
