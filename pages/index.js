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
  const [selectedUrl, setSelectedUrl] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 200;

  // ---- LOAD JOBS ----
  useEffect(() => {
    loadJobs();
  }, []);

  // Auto-refresh jobs every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      loadJobs();
      if (selectedJob) selectJob(selectedJob.id, offset);
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedJob, offset]);

  async function loadJobs() {
    try {
      const j = await api("/api/jobs");
      setJobs(j.jobs || []);
      // auto-select first job if none selected
      if (!selectedJob && j.jobs?.length) {
        selectJob(j.jobs[0].id, 0);
      }
    } catch (err) {
      console.error("Failed to load jobs", err);
    }
  }

  async function selectJob(id, offsetVal = 0) {
    try {
      setOffset(offsetVal);
      const data = await api(`/api/job/${id}?offset=${offsetVal}&limit=${limit}`);
      setSelectedJob(data.job);
      setResults(data.results || []);
      setHasMore(data.pagination?.hasMore || false);
    } catch (err) {
      console.error("Failed to select job", err);
    }
  }

  async function loadMore() {
    if (!selectedJob) return;
    const newOffset = offset + limit;
    try {
      const data = await api(
        `/api/job/${selectedJob.id}?offset=${newOffset}&limit=${limit}`
      );
      setResults((prev) => [...prev, ...(data.results || [])]);
      setOffset(newOffset);
      setHasMore(data.pagination?.hasMore || false);
    } catch (err) {
      console.error("Failed to load more results", err);
    }
  }

  async function cancelJob(id) {
    try {
      await api("/api/job/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id }),
      });
      await loadJobs();
    } catch (err) {
      console.error("Cancel job failed", err);
    }
  }

  // ---- CSV upload ----
  function parseCSVText(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].toLowerCase();
    let urls = header.includes("url")
      ? lines.slice(1).map((l) => l.split(",")[0].trim())
      : lines;
    urls = urls.map((u) => (u.startsWith("http") ? u : "https://" + u));
    return [...new Set(urls)];
  }

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
      await selectJob(resp.jobId, 0);
    };
    reader.readAsText(file);
  };

  const selectedResult = selectedUrl
    ? results.find((r) => r.url === selectedUrl)
    : null;

  // --- ERROR SUMMARY for SELECTED JOB ---
  const errorSummary = results
    .filter((r) => r.status === "error" && r.error_message)
    .reduce((acc, r) => {
      const key = r.error_message.split(" ")[0];
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  // ---------------------- UI ----------------------
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">Jobs</h2>
          <input type="file" accept=".csv" onChange={handleFile} />
        </div>

        {jobs.length === 0 ? (
          <div className="p-4 text-gray-500 text-sm">No jobs found</div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              onClick={() => selectJob(job.id, 0)}
              className={`p-3 cursor-pointer border-b ${
                selectedJob?.id === job.id ? "bg-blue-100" : "hover:bg-gray-50"
              }`}
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
              <div className="text-xs text-gray-500">
                {job.done ?? 0}/{job.total ?? 0} done
                {job.error > 0 && ` • ${job.error} errors`}
              </div>
              <div className="w-full bg-gray-200 rounded h-2 mt-1">
                <div
                  className="bg-blue-600 h-2 rounded"
                  style={{ width: `${job.progress ?? 0}%` }}
                />
              </div>
              {job.status === "cancelled" && (
                <div className="text-[10px] text-red-500 mt-1">Cancelled</div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selectedJob ? (
          <p className="text-gray-500">Select a job from the left</p>
        ) : (
          <>
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-bold">{selectedJob.name}</h1>
            </div>

            {/* Error breakdown for current job */}
            {Object.keys(errorSummary).length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                <h3 className="font-semibold mb-1">Error Breakdown:</h3>
                {Object.entries(errorSummary).map(([reason, count]) => (
                  <div key={reason}>
                    {reason}: {count}
                  </div>
                ))}
              </div>
            )}

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
                        : r.status === "error"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {r.status}
                  </span>

                  {r.retries > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Retries: {r.retries}{" "}
                      {r.error_message && (
                        <span className="text-red-600">
                          • {r.error_message}
                        </span>
                      )}
                    </p>
                  )}

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
                </div>
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={loadMore}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
