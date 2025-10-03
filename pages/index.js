// pages/index.js
import { useEffect, useState } from "react";

function parseCSVText(text) {
  // tolerant parse: supports header `URLs` or single-column lists
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  // check header
  const header = lines[0].split(",").map(s=>s.trim().toLowerCase());
  let urls = [];
  const urlHeaderIndex = header.findIndex(h => ["urls","url","website","domain"].includes(h));
  if (urlHeaderIndex >= 0) {
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const val = (cols[urlHeaderIndex]||"").trim();
      if (val) urls.push(val);
    }
  } else {
    // no header: treat each line as URL
    for (let i = 0; i < lines.length; i++) {
      const v = lines[i].replace(/['"]+/g, "").trim();
      if (v) urls.push(v);
    }
  }
  // normalize: ensure protocol
  urls = urls.map(u => {
    if (!/^https?:\/\//i.test(u)) return `https://${u}`;
    return u;
  });
  // unique preserve order
  return [...new Set(urls)];
}

export default function Dashboard() {
  const [urls, setUrls] = useState([]);
  const [results, setResults] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("psi_results_v1") || "{}");
    } catch (e) { return {}; }
  });
  const [selected, setSelected] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done:0, total:0 });

  useEffect(() => {
    localStorage.setItem("psi_results_v1", JSON.stringify(results));
  }, [results]);

  // CSV upload
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSVText(ev.target.result);
      setUrls(parsed);
      setProgress({ done: 0, total: parsed.length * 2 }); // mobile+desktop
    };
    reader.readAsText(file);
  };

  // helper to POST to our api/scan
  async function callScan(url, strategy) {
    const resp = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, strategy })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`API error ${resp.status}: ${txt}`);
    }
    const json = await resp.json();
    if (!json.ok) throw new Error(json.message || "PSI returned ok:false");
    return json;
  }

  const runAllSequential = async () => {
    if (!urls.length) return alert("Upload CSV first");
    setRunning(true);
    let doneCount = 0;
    const totalSteps = urls.length * 2;
    setProgress({ done: 0, total: totalSteps });

    const newResults = { ...results };

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      // skip already finished both strategies
      if (newResults[url] && newResults[url].desktop && newResults[url].mobile) {
        doneCount += 2;
        setProgress({ done: doneCount, total: totalSteps });
        continue;
      }
      // set pending/running
      newResults[url] = { ...(newResults[url]||{}), status: "Running" };
      setResults({ ...newResults });

      try {
        // mobile
        if (!newResults[url].mobile) {
          const mobile = await callScan(url, "mobile");
          newResults[url].mobile = {
            metrics: mobile.metrics,
            filmstrip: mobile.filmstrip,
            firstVisibleFrameIndex: mobile.firstVisibleFrameIndex,
            lighthouse: mobile.lighthouse
          };
        }
        doneCount++;
        setProgress({ done: doneCount, total: totalSteps });

        // desktop
        if (!newResults[url].desktop) {
          await new Promise(r => setTimeout(r, 1200)); // small throttle
          const desktop = await callScan(url, "desktop");
          newResults[url].desktop = {
            metrics: desktop.metrics,
            filmstrip: desktop.filmstrip,
            firstVisibleFrameIndex: desktop.firstVisibleFrameIndex,
            lighthouse: desktop.lighthouse
          };
        }
        doneCount++;
        newResults[url].status = "Done";
        setResults({ ...newResults });
        setProgress({ done: doneCount, total: totalSteps });
      } catch (err) {
        console.error("Scan error for", url, err);
        newResults[url].status = "Error";
        setResults({ ...newResults });
        doneCount += 2; // mark steps to avoid hanging progress
        setProgress({ done: doneCount, total: totalSteps });
      }

      // small delay so quotas are kind to the API
      await new Promise(r => setTimeout(r, 1500));
    }

    setRunning(false);
  };

  // UI helpers
  const downloadJSON = (obj, filename) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    // flatten results to CSV rows
    const rows = [["url","desktop_score","desktop_LCP","desktop_FCP","desktop_TBT","desktop_CLS","mobile_score","mobile_LCP","mobile_FCP","mobile_TBT","mobile_CLS","status"]];
    for (const u of urls) {
      const r = results[u] || {};
      rows.push([
        u,
        r.desktop?.metrics?.score ?? "",
        r.desktop?.metrics?.LCP ?? "",
        r.desktop?.metrics?.FCP ?? "",
        r.desktop?.metrics?.TBT ?? "",
        r.desktop?.metrics?.CLS ?? "",
        r.mobile?.metrics?.score ?? "",
        r.mobile?.metrics?.LCP ?? "",
        r.mobile?.metrics?.FCP ?? "",
        r.mobile?.metrics?.TBT ?? "",
        r.mobile?.metrics?.CLS ?? "",
        r.status ?? ""
      ]);
    }
    const csv = rows.map(r=>r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "pagespeed_results.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Inter,system-ui,Segoe UI,Roboto,Arial" }}>
      {/* Sidebar */}
      <div style={{ width: 340, borderRight: "1px solid #e6e6e6", padding: 20, overflowY: "auto", background:"#fff" }}>
        <h3 style={{ margin:0, marginBottom:12 }}>Domains</h3>
        <input type="file" accept=".csv" onChange={handleFile} style={{ marginBottom:12 }} />
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <button onClick={runAllSequential} disabled={running || !urls.length}>
            {running ? `Running ${progress.done}/${progress.total}` : "Run (mobile+desktop)"}
          </button>
          <button onClick={downloadCSV} disabled={!urls.length}>Download CSV</button>
        </div>

        <div style={{ fontSize:12, color:"#666", marginBottom:10 }}>
          Click domain to view filmstrip & metrics. Results persist in this browser (localStorage).
        </div>

        <div>
          {urls.map((u) => {
            const r = results[u] || {};
            const status = r.status || (r.desktop || r.mobile ? "Partial" : "Pending");
            return (
              <div key={u} style={{ padding:8, borderBottom:"1px solid #f0f0f0", cursor:"pointer" }} onClick={() => setSelected(u)}>
                <div style={{ fontSize:13, color:"#111", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u}</div>
                <div style={{ fontSize:12, color: status === "Done" ? "#059669" : status === "Running" ? "#d97706" : "#6b7280" }}>{status}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop:16 }}>
          <h4 style={{ margin: "8px 0" }}>Summary</h4>
          <div style={{ fontSize:13, color:"#333" }}>Total URLs: {urls.length}</div>
          <div style={{ fontSize:13, color:"#333" }}>Completed: {Object.values(results).filter(r=>r.desktop && r.mobile).length}</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, padding:20, overflow:"auto", background:"#f7fafc" }}>
        <h2 style={{ marginTop:0 }}>PageSpeed Dashboard</h2>

        {/* big table */}
        <div style={{ background:"#fff", borderRadius:8, boxShadow:"0 1px 2px rgba(0,0,0,0.04)", overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead style={{ background:"#f3f4f6" }}>
              <tr>
                <th style={{ padding:10, borderBottom:"1px solid #eee", textAlign:"left" }}>URL</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>Status</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>Desktop Score</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>LCP</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>FCP</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>TBT</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>CLS</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>Mobile Score</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>LCP</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>FCP</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>TBT</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>CLS</th>
                <th style={{ padding:10, borderBottom:"1px solid #eee" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {urls.map(u => {
                const r = results[u] || {};
                return (
                  <tr key={u} style={{ borderBottom:"1px solid #f3f3f3" }}>
                    <td style={{ padding:10, maxWidth:350, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u}</td>
                    <td style={{ padding:10 }}>{r.status || "Pending"}</td>
                    <td style={{ padding:10 }}>{r.desktop?.metrics?.score ?? "-"}</td>
                    <td style={{ padding:10 }}>{r.desktop?.metrics?.LCP ?? "-"}</td>
                    <td style={{ padding:10 }}>{r.desktop?.metrics?.FCP ?? "-"}</td>
                    <td style={{ padding:10 }}>{r.desktop?.metrics?.TBT ?? "-"}</td>
                    <td style={{ padding:10 }}>{r.desktop?.metrics?.CLS ?? "-"}</td>
                    <td style={{ padding:10 }}>{r.mobile?.metrics?.score ?? "-"}</td>
                    <td style={{ padding:10 }}>{r.mobile?.metrics?.LCP ?? "-"}</td>
                    <td style={{ padding:10 }}>{r.mobile?.metrics?.FCP ?? "-"}</td>
                    <td style={{ padding:10 }}>{r.mobile?.metrics?.TBT ?? "-"}</td>
                    <td style={{ padding:10 }}>{r.mobile?.metrics?.CLS ?? "-"}</td>
                    <td style={{ padding:10 }}>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => selected === u ? setSelected(null) : setSelected(u)}>Open</button>
                        {r.desktop?.lighthouse && <button onClick={() => downloadJSON(r.desktop.lighthouse, `${u.replace(/[:\/]/g,"_")}-desktop-lh.json`)}>Download LH</button>}
                        {r.mobile?.lighthouse && <button onClick={() => downloadJSON(r.mobile.lighthouse, `${u.replace(/[:\/]/g,"_")}-mobile-lh.json`)}>Download LH</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* selected domain details */}
        <div style={{ marginTop:20 }}>
          {!selected ? <div style={{ color:"#6b7280" }}>Click a domain on the left to view filmstrip and detailed metrics.</div> : (
            (() => {
              const r = results[selected];
              if (!r) return <div>No results yet for {selected}</div>;
              return (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:20 }}>
                  <div style={{ background:"#fff", padding:16, borderRadius:8 }}>
                    <h3 style={{ marginTop:0 }}>Detailed metrics — {selected}</h3>
                    <div style={{ display:"flex", gap:12 }}>
                      <div style={{ flex:1 }}>
                        <h4>Desktop</h4>
                        <div>Performance Score: <strong>{r.desktop?.metrics?.score ?? "-"}</strong></div>
                        <div>LCP: {r.desktop?.metrics?.LCP ?? "-"}</div>
                        <div>FCP: {r.desktop?.metrics?.FCP ?? "-"}</div>
                        <div>TBT: {r.desktop?.metrics?.TBT ?? "-"}</div>
                        <div>CLS: {r.desktop?.metrics?.CLS ?? "-"}</div>
                        <div style={{ marginTop:8 }}>
                          <strong>First visible frame index:</strong> {r.desktop?.firstVisibleFrameIndex ?? "N/A"}
                        </div>
                      </div>
                      <div style={{ flex:1 }}>
                        <h4>Mobile</h4>
                        <div>Performance Score: <strong>{r.mobile?.metrics?.score ?? "-"}</strong></div>
                        <div>LCP: {r.mobile?.metrics?.LCP ?? "-"}</div>
                        <div>FCP: {r.mobile?.metrics?.FCP ?? "-"}</div>
                        <div>TBT: {r.mobile?.metrics?.TBT ?? "-"}</div>
                        <div>CLS: {r.mobile?.metrics?.CLS ?? "-"}</div>
                        <div style={{ marginTop:8 }}>
                          <strong>First visible frame index:</strong> {r.mobile?.firstVisibleFrameIndex ?? "N/A"}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop:16 }}>
                      <h4>Desktop filmstrip</h4>
                      <div style={{ display:"flex", gap:8, overflowX:"auto", paddingTop:8 }}>
                        {r.desktop?.filmstrip?.map((f, idx) => (
                          <div key={idx} style={{ textAlign:"center" }}>
                            <img src={f.data} alt={`f${idx}`} style={{ width:120, height:"auto", border: idx === r.desktop.firstVisibleFrameIndex ? "3px solid #16a34a" : "1px solid #ddd", borderRadius:6 }} />
                            <div style={{ fontSize:11 }}>{idx}</div>
                          </div>
                        )) || <div style={{ color:"#6b7280" }}>No filmstrip</div>}
                      </div>

                      <h4 style={{ marginTop:12 }}>Mobile filmstrip</h4>
                      <div style={{ display:"flex", gap:8, overflowX:"auto", paddingTop:8 }}>
                        {r.mobile?.filmstrip?.map((f, idx) => (
                          <div key={idx} style={{ textAlign:"center" }}>
                            <img src={f.data} alt={`f${idx}`} style={{ width:90, height:"auto", border: idx === r.mobile.firstVisibleFrameIndex ? "3px solid #16a34a" : "1px solid #ddd", borderRadius:6 }} />
                            <div style={{ fontSize:11 }}>{idx}</div>
                          </div>
                        )) || <div style={{ color:"#6b7280" }}>No filmstrip</div>}
                      </div>
                    </div>
                  </div>

                  <aside style={{ background:"#fff", padding:16, borderRadius:8 }}>
                    <h4 style={{ marginTop:0 }}>Actions</h4>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {r.desktop?.lighthouse && <button onClick={() => downloadJSON(r.desktop.lighthouse, `${selected.replace(/[:\/]/g,"_")}-desktop-lh.json`)}>Download Desktop LH JSON (for Treemap)</button>}
                      {r.mobile?.lighthouse && <button onClick={() => downloadJSON(r.mobile.lighthouse, `${selected.replace(/[:\/]/g,"_")}-mobile-lh.json`)}>Download Mobile LH JSON</button>}
                      <button onClick={() => {
                        // download all filmstrip frames as one ZIP-like (simple approach: create multiple links)
                        const farr = r.desktop?.filmstrip || r.mobile?.filmstrip || [];
                        farr.forEach((f, idx) => {
                          const a = document.createElement("a");
                          a.href = f.data;
                          a.download = `${selected.replace(/[:\/]/g,"_")}-frame-${idx}.png`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                        });
                      }}>Download filmstrip images (desktop)</button>
                    </div>
                  </aside>
                </div>
              );
            })()
          )}
        </div>

      </div>
    </div>
  );
}
