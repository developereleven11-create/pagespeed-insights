// pages/index.js
import { useState, useEffect, useCallback } from "react";

/**
 * Dashboard (pages/index.js)
 * - Expects backend endpoints:
 *   GET  /api/jobs               -> { jobs: [...] }
 *   GET  /api/job/:id?offset=&limit= -> { job: {...}, results: [...], pagination: {...} }
 *   POST /api/job/create         -> { jobId: <id> }
 *   POST /api/job/cancel         -> { ok: true }
 *
 * Paste this file as-is into pages/index.js
 */

const api = async (url, opts = {}) => {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(text || "API error");
  }
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
  const [selectedJob, setSelectedJob] = useState(null); // job object
  const [selectedJobId, setSelectedJobId] = useState(null); // id (for stable effect)
  const [results, setResults] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 200;

  // selected filmstrip view
  const [selectedUrl, setSelectedUrl] = useState(null);

  // Load jobs list
  const loadJobs = useCallback(async () => {
    try {
      const j = await api("/api/jobs");
      setJobs(Array.isArray(j.jobs) ? j.jobs : []);
      // if no job selected, auto-select first
      if (!selectedJobId && Array.isArray(j.jobs) && j.jobs.length) {
        // pick first job id (most recent)
        const id = j.jobs[0].id;
        setSelectedJobId(id);
      }
    } catch (err) {
      console.error("Failed to load jobs", err);
    }
  }, [selectedJobId]);

  useEffect(() => {
    loadJobs();
    // initial poll: keep jobs list updated
    const iv = setInterval(loadJobs, 15000);
    return () => clearInterval(iv);
  }, [loadJobs]);

  // Load selected job + first page of results
  const loadJobPage = useCallback(
    async (jobId, offsetVal = 0) => {
      if (!jobId) return;
      try {
        const data = await api(`/api/job/${jobId}?offset=${offsetVal}&limit=${limit}`);
        setSelectedJob(data.job || null);
        setResults(Array.isArray(data.results) ? data.results : []);
        setOffset(offsetVal);
        setHasMore(Boolean(data.pagination?.hasMore));
        // set selectedJobId for stable tracking
        setSelectedJobId(jobId);
      } catch (err) {
        console.error("Failed to load job details", err);
        // Leave existing state as-is; don't clobber UI on temporary API errors
      }
    },
    []
  );

  // when selectedJobId changes, load job
  useEffect(() => {
    if (selectedJobId) {
      loadJobPage(selectedJobId, 0);
    }
  }, [selectedJobId, loadJobPage]);

  // "Load more" page
  const loadMore = async () => {
    if (!selectedJobId) return;
    const newOffset = offset + limit;
    try {
      const data = await api(`/api/job/${selectedJobId}?offset=${newOffset}&limit=${limit}`);
      setResults((prev) => [...prev, ...(Array.isArray(data.results) ? data.results : [])]);
      setOffset(newOffset);
      setHasMore(Boolean(data.pagination?.hasMore));
    } catch (err) {
      console.error("Failed to load more results", err);
    }
  };

  // select job from sidebar
  const selectJob = (jobId) => {
    if (!jobId) return;
    setSelectedJobId(jobId);
    // loadJobPage will run because selectedJobId changed
  };

  // Cancel job
  const cancelJob = async (id) => {
    try {
      await api("/api/job/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id }),
      });
      await loadJobs();
      if (id === selectedJobId) {
        // refresh current job
        await loadJobPage(selectedJobId, offset);
      }
    } catch (err) {
      console.error("Cancel failed", err);
    }
  };

  // CSV parsing + create job
  const parseCSVText = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].toLowerCase();
    let urls = [];
    if (header.includes("url")) {
      urls = lines.slice(1).map((l) => l.split(",")[0].trim()).filter(Boolean);
    } else {
      urls = lines;
    }
    urls = urls.map((u) => (u.startsWith("http") ? u : "https://" + u));
    return Array.from(new Set(urls));
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const parsed = parseCSVText(ev.target.result || "");
      if (!parsed.length) return alert("No URLs found in CSV");
      const name = `Job ${new Date().toLocaleString()}`;
      try {
        const resp = await api("/api/job/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, urls: parsed }),
        });
        // refresh jobs and select the new job
        await loadJobs();
        if (resp?.jobId) {
          setSelectedJobId(resp.jobId);
        }
      } catch (err) {
        console.error("Failed to create job", err);
        alert("Failed to create job: " + String(err.message || err));
      }
    };
    reader.readAsText(file);
  };

  // simple helper to compute error summary for current results
  const errorSummary = results
    .filter((r) => r.status === "error" && r.error_message)
    .reduce((acc, r) => {
      // reduce verbose error messages to short keys
      const key = String(r.error_message).split(/[,: ]+/).slice(0, 3).join(" ");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  const selectedResult = selectedUrl ? results.find((r) => r.url === selectedUrl) : null;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">Jobs</h2>
          <input className="mt-2" type="file" accept=".csv" onChange={handleFile} />
        </div>

        {jobs.length === 0 ? (
          <div className="p-4 text-gray-500">No jobs yet — upload a CSV</div>
        ) : (
          jobs.map((job) => (
            <div
              onClick={() => selectJob(job.id)}
              key={job.id}
              className={`p-3 cursor-pointer border-b ${selectedJobId === job.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
            >
              <div className="flex justify-between items-center">
                <div className="font-medium truncate">{job.name}</div>
                {job.status !== "done" && job.status !== "cancelled" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      cancelJob(job.id);
                    }}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div className="text-xs text-gray-500 mt-1">
                {job.done ?? 0}/{job.total ?? 0} done
                {job.error > 0 && ` • ${job.error} errors`}
              </div>

              <div className="w-full bg-gray-200 rounded h-2 mt-2">
                <div
                  className="bg-blue-600 h-2 rounded"
                  style={{ width: `${job.progress ?? 0}%` }}
                />
              </div>
            </div>
          ))
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 overflow-y-auto">
        {!selectedJob ? (
          <p className="text-gray-500">Select a job on the left to see results</p>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold">{selectedJob.name}</h1>
                <div className="text-sm text-gray-500 mt-1">
                  {selectedJob.done ?? 0}/{selectedJob.total ?? 0} done • {selectedJob.error ?? 0} errors
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-gray-500">Status: {selectedJob.status}</div>
                <div className="mt-2">
                  <button
                    onClick={() => loadJobPage(selectedJobId, 0)}
                    className="px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => setSelectedUrl(null)}
                    className="ml-2 px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200"
                  >
                    Close Filmstrip
                  </button>
                </div>
              </div>
            </div>

            {/* Error breakdown */}
            {Object.keys(errorSummary).length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                <div className="font-semibold mb-1">Error Breakdown (selected page)</div>
                {Object.entries(errorSummary).map(([k, v]) => (
                  <div key={k}>
                    {k}: {v}
                  </div>
                ))}
              </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((r) => (
                <div key={r.id} className="bg-white p-4 rounded shadow flex flex-col">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold truncate">{r.url}</h3>
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded ${
                        r.status === "done"
                          ? "bg-green-100 text-green-700"
                          : r.status === "pending"
                          ? "bg-gray-100 text-gray-700"
                          : r.status === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>

                  {r.retries > 0 && (
                    <div className="text-xs text-gray-500 mt-2">
                      Retries: {r.retries} {r.error_message && <span className="text-red-600">• {r.error_message}</span>}
                    </div>
                  )}

                  {/* Score badges */}
                  <div className="flex gap-4 my-4 items-center">
                    <div className={`w-12 h-12 flex items-center justify-center rounded-full text-lg font-bold ${scoreColor(r.desktop?.score)}`}>
                      {r.desktop?.score ?? "--"}
                    </div>
                    <div className={`w-12 h-12 flex items-center justify-center rounded-full text-lg font-bold ${scoreColor(r.mobile?.score)}`}>
                      {r.mobile?.score ?? "--"}
                    </div>
                    <div className="text-sm text-gray-500 ml-2">
                      <div>Desktop / Mobile</div>
                    </div>
                  </div>

                  {/* small metric line */}
                  <div className="text-sm text-gray-700">
                    {r.desktop && (
                      <div className="mb-1">
                        <span className="font-semibold">D:</span> LCP {r.desktop.lcp ?? "—"}, FCP {r.desktop.fcp ?? "—"}, TBT {r.desktop.tbt ?? "—"}, CLS {r.desktop.cls ?? "—"}
                      </div>
                    )}
                    {r.mobile && (
                      <div>
                        <span className="font-semibold">M:</span> LCP {r.mobile.lcp ?? "—"}, FCP {r.mobile.fcp ?? "—"}, TBT {r.mobile.tbt ?? "—"}, CLS {r.mobile.cls ?? "—"}
                      </div>
                    )}
                  </div>

                  <div className="mt-3">
                    <button onClick={() => setSelectedUrl(r.url)} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">
                      View Filmstrip
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button onClick={loadMore} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Filmstrip drawer */}
      {selectedResult && (
        <aside className="fixed top-0 right-0 w-full sm:w-[480px] h-full bg-white shadow-lg overflow-y-auto transition-all z-50">
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="text-lg font-bold truncate">{selectedResult.url}</h2>
            <button onClick={() => setSelectedUrl(null)} className="text-gray-500 hover:text-gray-800">✕</button>
          </div>

          <div className="p-4">
            <h3 className="font-semibold mb-2">Desktop Filmstrip</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {selectedResult.desktop?.filmstrip?.map((f, i) => (
                <img key={i} src={f.data} alt={`frame ${i}`} className="w-32 border border-gray-300" />
              ))}
              {!selectedResult.desktop?.filmstrip?.length && <div className="text-sm text-gray-400">No frames</div>}
            </div>

            <h3 className="font-semibold mt-4 mb-2">Mobile Filmstrip</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {selectedResult.mobile?.filmstrip?.map((f, i) => (
                <img key={i} src={f.data} alt={`frame ${i}`} className="w-24 border border-gray-300" />
              ))}
              {!selectedResult.mobile?.filmstrip?.length && <div className="text-sm text-gray-400">No frames</div>}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
