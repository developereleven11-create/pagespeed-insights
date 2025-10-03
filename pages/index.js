import { useState, useEffect } from "react";

const api = async (url, opts = {}) => {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const scoreColor = (score) => {
  if (score === null || score === undefined) return "bg-gray-300 text-gray-800";
  if (score >= 90) return "bg-green-500 text-white";
  if (score >= 50) return "bg-yellow-500 text-white";
  return "bg-red-500 text-white";
};

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState(null);

  // Load jobs on mount
  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    try {
      const j = await api("/api/jobs");
      setJobs(j.jobs);
      if (!selectedJob && j.jobs.length) {
        selectJob(j.jobs[0].id);
      }
    } catch (err) {
      console.error("Failed to load jobs", err);
    }
  }

  async function selectJob(id) {
    try {
      const data = await api(`/api/job/${id}`);
      setSelectedJob(data.job);
      setResults(data.results);
    } catch (err) {
      console.error(err);
    }
  }

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

  // Upload new CSV = new Job
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const parsed = parseCSVText(ev.target.result);
      const name = `Job ${new Date().toLocaleString()}`;
      const resp = await api("/api/job/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, urls: parsed }),
      });
      await loadJobs();
      await selectJob(resp.jobId);
    };
    reader.readAsText(file);
  };

  // Run job step-by-step
  const runJob = async (id) => {
    setRunning(true);
    let done = false;
    while (!done) {
      const resp = await api("/api/job/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id }),
      });
      if (resp.done) {
        done = true;
      }
      await selectJob(id);
      await new Promise((r) => setTimeout(r, 1500));
    }
    setRunning(false);
  };

  const selectedResult = selectedUrl
    ? results.find((r) => r.url === selectedUrl)
    : null;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">Jobs</h2>
          <input type="file" accept=".csv" onChange={handleFile} />
        </div>
        <ul>
          {jobs.map((job) => (
            <li
              key={job.id}
              onClick={() => selectJob(job.id)}
              className={`p-3 cursor-pointer ${
                selectedJob?.id === job.id ? "bg-blue-100" : "hover:bg-gray-100"
              }`}
            >
              <div className="font-medium truncate">{job.name}</div>
              <div className="text-xs text-gray-500">{job.status}</div>
            </li>
          ))}
        </ul>
      </div>

      {/* Main Dashboard */}
      <div className="flex-1 p-6 overflow-y-auto">
        {selectedJob ? (
          <>
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold">{selectedJob.name}</h1>
              <button
                disabled={running}
                onClick={() => runJob(selectedJob.id)}
                className={`px-4 py-2 rounded text-white ${
                  running
                    ? "bg-gray-400"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {running ? "Running..." : "Run Job"}
              </button>
            </div>

            {/* Results grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((r) => (
                <div
                  key={r.id}
                  className="bg-white p-4 rounded shadow flex flex-col"
                >
                  <h2 className="font-semibold truncate">{r.url}</h2>
                  <span
                    className={`inline-block px-2 py-1 text-xs rounded mt-1 ${
                      r.status === "done"
                        ? "bg-green-100 text-green-700"
                        : r.status === "pending"
                        ? "bg-gray-100 text-gray-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {r.status}
                  </span>

                  {/* Scores */}
                  <div className="flex gap-4 my-4">
                    <div
                      className={`w-12 h-12 flex items-center justify-center rounded-full text-lg font-bold ${scoreColor(
                        r.desktop?.score
                      )}`}
                    >
                      {r.desktop?.score ?? "--"}
                    </div>
                    <div
                      className={`w-12 h-12 flex items-center justify-center rounded-full text-lg font-bold ${scoreColor(
                        r.mobile?.score
                      )}`}
                    >
                      {r.mobile?.score ?? "--"}
                    </div>
                  </div>

                  {/* Metrics */}
                  {r.desktop && (
                    <div className="text-sm text-gray-700">
                      <p>
                        <span className="font-semibold">Desktop:</span>{" "}
                        LCP {r.desktop.lcp}, FCP {r.desktop.fcp}, TBT {r.desktop.tbt}, CLS {r.desktop.cls}
                      </p>
                    </div>
                  )}
                  {r.mobile && (
                    <div className="text-sm text-gray-700 mt-1">
                      <p>
                        <span className="font-semibold">Mobile:</span>{" "}
                        LCP {r.mobile.lcp}, FCP {r.mobile.fcp}, TBT {r.mobile.tbt}, CLS {r.mobile.cls}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => setSelectedUrl(r.url)}
                    className="mt-3 px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                  >
                    View Filmstrip
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-gray-500">Select a job from the left</p>
        )}
      </div>

      {/* Filmstrip Drawer */}
      {selectedResult && (
        <div className="fixed top-0 right-0 w-full sm:w-[480px] h-full bg-white shadow-lg overflow-y-auto transition-all">
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="text-lg font-bold">{selectedResult.url}</h2>
            <button
              className="text-gray-500 hover:text-gray-800"
              onClick={() => setSelectedUrl(null)}
            >
              ✕
            </button>
          </div>

          <div className="p-4">
            <h3 className="font-semibold mb-2">Desktop Filmstrip</h3>
            <div className="flex gap-2 overflow-x-auto">
              {selectedResult.desktop?.filmstrip?.map((f, i) => (
                <img
                  key={i}
                  src={f.data}
                  alt={`frame ${i}`}
                  className="w-32 border border-gray-300"
                />
              ))}
            </div>

            <h3 className="font-semibold mt-4 mb-2">Mobile Filmstrip</h3>
            <div className="flex gap-2 overflow-x-auto">
              {selectedResult.mobile?.filmstrip?.map((f, i) => (
                <img
                  key={i}
                  src={f.data}
                  alt={`frame ${i}`}
                  className="w-24 border border-gray-300"
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
