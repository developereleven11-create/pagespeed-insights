<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PageSpeed Batch Runner</title>
    <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body {
        font-family: system-ui, sans-serif;
        margin: 0;
        display: flex;
        height: 100vh;
        background: #f6f8fa;
      }
      .sidebar {
        width: 280px;
        background: #1e1e2f;
        color: white;
        padding: 1rem;
        overflow-y: auto;
      }
      .sidebar h2 {
        font-size: 1.2rem;
        margin-bottom: 1rem;
      }
      .domain-item {
        padding: 0.6rem;
        background: #2a2a40;
        margin-bottom: 0.5rem;
        border-radius: 6px;
        cursor: pointer;
      }
      .domain-item:hover {
        background: #353556;
      }
      .main {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 1.5rem;
        overflow-y: auto;
      }
      h1 {
        margin-bottom: 1rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 0 5px rgba(0, 0, 0, 0.05);
      }
      th, td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: center;
      }
      th {
        background: #f0f0f0;
      }
      button {
        padding: 8px 16px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
      }
      button:hover {
        background: #0056b3;
      }
      .filmstrip {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 10px;
      }
      .filmstrip img {
        width: 90px;
        border-radius: 4px;
        border: 1px solid #ddd;
      }
      .status {
        padding: 4px 8px;
        border-radius: 4px;
        color: white;
        font-weight: 500;
      }
      .status.Pending { background: #999; }
      .status.Running { background: #f0ad4e; }
      .status.Completed { background: #5cb85c; }
      .status.Error { background: #d9534f; }
    </style>
  </head>
  <body>
    <div class="sidebar">
      <h2>Domains</h2>
      <div id="domainList"></div>
      <div id="filmstrip"></div>
    </div>
    <div class="main">
      <h1>Batch PageSpeed Runner</h1>
      <input type="file" id="fileInput" accept=".csv" />
      <button id="runBtn">Run PageSpeed</button>
      <table id="resultTable">
        <thead>
          <tr>
            <th>URL</th>
            <th>Status</th>
            <th>Desktop Score</th>
            <th>Mobile Score</th>
            <th>FCP</th>
            <th>LCP</th>
            <th>CLS</th>
            <th>TBT</th>
            <th>Treemap</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>

    <script>
      const apiKey = "YOUR_API_KEY"; // Replace with your API key
      let domains = [];
      const tableBody = document.querySelector("#resultTable tbody");
      const domainList = document.getElementById("domainList");
      const filmstripDiv = document.getElementById("filmstrip");

      document.getElementById("fileInput").addEventListener("change", handleFile);
      document.getElementById("runBtn").addEventListener("click", runBatch);

      function handleFile(e) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = function(evt) {
          const lines = evt.target.result.split("\n").map(l => l.trim()).filter(Boolean);
          domains = lines.slice(1).map(row => row.replace(/^https?:\/\//, '').replace(/\/$/, '')).map(d => "https://" + d);
          renderTable();
          renderSidebar();
        };
        reader.readAsText(file);
      }

      function renderTable() {
        tableBody.innerHTML = "";
        domains.forEach(url => {
          const row = document.createElement("tr");
          row.innerHTML = `
            <td>${url}</td>
            <td class="status Pending">Pending</td>
            <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>
            <td><button disabled>Treemap</button></td>`;
          tableBody.appendChild(row);
        });
      }

      function renderSidebar() {
        domainList.innerHTML = "";
        domains.forEach((url, idx) => {
          const div = document.createElement("div");
          div.className = "domain-item";
          div.textContent = url;
          div.onclick = () => showFilmstrip(url);
          domainList.appendChild(div);
        });
      }

      async function runBatch() {
        for (let i = 0; i < domains.length; i++) {
          const url = domains[i];
          const row = tableBody.rows[i];
          const statusCell = row.cells[1];
          statusCell.textContent = "Running";
          statusCell.className = "status Running";

          try {
            const desktopData = await fetchPageSpeed(url, "desktop");
            const mobileData = await fetchPageSpeed(url, "mobile");
            const desktopScore = desktopData.lighthouseResult.categories.performance.score * 100;
            const mobileScore = mobileData.lighthouseResult.categories.performance.score * 100;
            const audits = desktopData.lighthouseResult.audits;

            const fcp = audits["first-contentful-paint"].displayValue;
            const lcp = audits["largest-contentful-paint"].displayValue;
            const cls = audits["cumulative-layout-shift"].displayValue;
            const tbt = audits["total-blocking-time"].displayValue;

            row.cells[2].textContent = desktopScore;
            row.cells[3].textContent = mobileScore;
            row.cells[4].textContent = fcp;
            row.cells[5].textContent = lcp;
            row.cells[6].textContent = cls;
            row.cells[7].textContent = tbt;
            row.cells[1].textContent = "Completed";
            row.cells[1].className = "status Completed";

            const treemapURL = `https://googlechrome.github.io/lighthouse/treemap/?load=${encodeURIComponent(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=desktop&category=performance&key=${apiKey}`)}`;
            const treemapBtn = row.cells[8].querySelector("button");
            treemapBtn.disabled = false;
            treemapBtn.onclick = () => window.open(treemapURL, "_blank");

            // Save filmstrip screenshots
            const filmstrip = desktopData.lighthouseResult.audits["screenshot-thumbnails"].details.items.map(i => i.data);
            localStorage.setItem(url, JSON.stringify(filmstrip));
          } catch (err) {
            console.error(err);
            statusCell.textContent = "Error";
            statusCell.className = "status Error";
          }
        }
      }

      async function fetchPageSpeed(url, strategy) {
        const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&key=${apiKey}`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`Failed for ${url}`);
        return await res.json();
      }

      function showFilmstrip(url) {
        const data = JSON.parse(localStorage.getItem(url) || "[]");
        filmstripDiv.innerHTML = "<h3>Filmstrip</h3>";
        const div = document.createElement("div");
        div.className = "filmstrip";
        data.forEach(img => {
          const image = document.createElement("img");
          image.src = img;
          div.appendChild(image);
        });
        filmstripDiv.appendChild(div);
      }
    </script>
  </body>
</html>
