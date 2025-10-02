import { useState } from "react";

export default function Home() {
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/).filter(Boolean);
      const parsed = lines.map((url) => ({
        url: url.trim(),
        mobileScore: "",
        desktopScore: "",
        mobileScreenshot: "",
        desktopScreenshot: "",
        status: "Pending",
      }));
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  const runPageSpeed = async () => {
    if (running) return;
    setRunning(true);
    const apiKey = process.env.NEXT_PUBLIC_PAGESPEED_API_KEY; // set this in .env.local
    const updatedRows = [...rows];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      updatedRows[i].status = "Running...";
      setRows([...updatedRows]);

      try {
        // MOBILE
        const mobileRes = await fetch(
          `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
            row.url
          )}&strategy=mobile&key=${apiKey}`
        );
        const mobileData = await mobileRes.json();
        const mobileScore =
          mobileData.lighthouseResult?.categories?.performance?.score * 100 || "N/A";
        const mobileShot =
          mobileData.lighthouseResult?.audits["final-screenshot"]?.details?.data || "";

        // DESKTOP
        const desktopRes = await fetch(
          `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
            row.url
          )}&strategy=desktop&key=${apiKey}`
        );
        const desktopData = await desktopRes.json();
        const desktopScore =
          desktopData.lighthouseResult?.categories?.performance?.score * 100 || "N/A";
        const desktopShot =
          desktopData.lighthouseResult?.audits["final-screenshot"]?.details?.data || "";

        updatedRows[i] = {
          ...row,
          mobileScore,
          desktopScore,
          mobileScreenshot: mobileShot,
          desktopScreenshot: desktopShot,
          status: "Done ✅",
        };
      } catch (err) {
        updatedRows[i].status = "Error ❌";
      }

      setRows([...updatedRows]);
      await delay(3000); // wait 3s between calls to avoid quota issues
    }

    setRunning(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-6 text-center">
        🚀 PageSpeed Analyzer Dashboard
      </h1>

      <div className="flex justify-center mb-6 gap-4">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="border p-2 rounded bg-white shadow"
        />
        <button
          onClick={runPageSpeed}
          disabled={running || rows.length === 0}
          className={`px-4 py-2 rounded text-white font-semibold shadow ${
            running
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {running ? "Running..." : "Run PageSpeed"}
        </button>
      </div>

      <table className="min-w-full bg-white border shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-4 py-2">#</th>
            <th className="border px-4 py-2">URL</th>
            <th className="border px-4 py-2">Mobile Score</th>
            <th className="border px-4 py-2">Desktop Score</th>
            <th className="border px-4 py-2">Mobile Screenshot</th>
            <th className="border px-4 py-2">Desktop Screenshot</th>
            <th className="border px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="text-center">
              <td className="border px-2 py-2">{idx + 1}</td>
              <td className="border px-2 py-2 text-blue-600 underline">
                <a href={row.url} target="_blank" rel="noopener noreferrer">
                  {row.url}
                </a>
              </td>
              <td className="border px-2 py-2">{row.mobileScore}</td>
              <td className="border px-2 py-2">{row.desktopScore}</td>
              <td className="border px-2 py-2">
                {row.mobileScreenshot && (
                  <img
                    src={row.mobileScreenshot}
                    alt="Mobile"
                    className="w-32 mx-auto rounded shadow"
                  />
                )}
              </td>
              <td className="border px-2 py-2">
                {row.desktopScreenshot && (
                  <img
                    src={row.desktopScreenshot}
                    alt="Desktop"
                    className="w-32 mx-auto rounded shadow"
                  />
                )}
              </td>
              <td className="border px-2 py-2 font-medium">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="text-center mt-8 text-gray-500">
          Upload a CSV with one column named <strong>URLS</strong> (no header required).
        </p>
      )}
    </div>
  );
}
