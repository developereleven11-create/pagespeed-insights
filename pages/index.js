import { useState, useEffect } from "react";

export default function Dashboard() {
  const [urls, setUrls] = useState([]);
  const [results, setResults] = useState({});
  const [selected, setSelected] = useState(null);
  const [running, setRunning] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [progress, setProgress] = useState(0);

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
      const lines = event.target.result
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      let clean = [];
      if (lines[0].toLowerCase().includes("url")) {
        clean = lines.slice(1);
      } else {
        clean = lines;
      }

      clean = clean.map((line) =>
        line
          .replace(/['"]+/g, "")
          .replace(/\r/g, "")
          .trim()
      );

      setUrls(clean);
      setProgress(0);
    };
    reader.readAsText(file);
  };

  const runTests = async () => {
    if (!apiKey) return alert("Missing API key!");
    if (urls.length === 0) return alert("No URLs found!");

    setRunning(true);
    let newResults = { ...results };

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      newResults[url] = newResults[url] || { status: "Running" };
      setResults({ ...newResults });

      try {
        const desktop = await fetchReport(url, "desktop");
        const mobile = await fetchReport(url, "mobile");
        newResults[url] = { desktop, mobile, status: "Done" };
        setResults({ ...newResults });
        localStorage.setItem("results", JSON.stringify(newResults));
      } catch (e) {
        newResults[url] = { status: "Error" };
        console.error("Error fetching", url, e);
      }
      setProgress(Math.round(((i + 1) / urls.length) * 100));
      await new Promise((r) => setTimeout(r, 3000)); // delay
    }
    setRunning(false);
  };

  const fetchReport = async (url, strategy) => {
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
        url
      )}&strategy=${strategy}&category=performance&key=${apiKey}`
    );
    const data = await res.json();
    const audits = data.lighthouseResult?.audits || {};
    return {
      score:
        (data.lighthouseResult?.categories?.performance?.score || 0) * 100,
      FCP: audits["first-contentful-paint"]?.displayValue || "N/A",
      LCP: audits["largest-contentful-paint"]?.displayValue || "N/A",
      TBT: audits["total-blocking-time"]?.displayValue || "N/A",
      CLS: audits["cumulative-layout-shift"]?.displayValue || "N/A",
      SpeedIndex: audits["speed-index"]?.displayValue || "N/A",
    };
  };

  return (
    <div className="flex h-screen font-sans bg-gray-100">
      {/* Sidebar */}
      <div className="w-1/4 bg-white border-r flex flex-col">
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
          {running && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs mt-1 text-center text-gray-600">{progress}% completed</p>
            </div>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto">
          {urls.length === 0 ? (
            <li className="p-4 text-gray-400 text-center">Upload a CSV to begin</li>
          ) : (
            urls.map((url) => (
              <li
                key={url}
                onClick={() => setSelected(url)}
                className={`cursor-pointer p-3 border-b hover:bg-gray-100 ${
                  selected === url ? "bg-gray-200 font-semibold" : ""
                }`}
              >
                <p className="truncate">{url}</p>
                <p
                  className={`text-xs ${
                    results[url]?.status === "Done"
                      ? "text-green-600"
                      : results[url]?.status === "Running"
                      ? "text-blue-600"
                      : results[url]?.status === "Error"
                      ? "text-red-600"
                      : "text-gray-400"
                  }`}
                >
                  {results[url]?.status || "Pending"}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Main content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selected ? (
          <p className="text-gray-500 text-lg">Select a domain from the sidebar</p>
        ) : !results[selected] || !results[selected].desktop ? (
          <p className="text-gray-500 text-lg">Results not yet available for {selected}</p>
        ) : (
          <div>
            <h2 className="text-2xl font-bold mb-4">{selected}</h2>
            <div className="grid grid-cols-2 gap-6">
              {["desktop", "mobile"].map((type) => (
                <div key={type} className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-lg font-semibold capitalize mb-2">
                    {type} Report
                  </h3>
                  <p className="text-sm text-gray-500 mb-2">
                    Performance Score:{" "}
                    <span className="font-bold text-blue-600">
                      {results[selected][type]?.score || "N/A"}
                    </span>
                  </p>
                  <table className="w-full text-sm">
                    <tbody>
                      {["FCP", "LCP", "TBT", "CLS", "SpeedIndex"].map((metric) => (
                        <tr key={metric} className="border-b">
                          <td className="py-1 font-medium">{metric}</td>
                          <td className="py-1 text-right">
                            {results[selected][type][metric]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
