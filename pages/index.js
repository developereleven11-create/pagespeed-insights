import { useState } from 'react'
import Papa from 'papaparse'
import useSWR from 'swr'

export default function Home() {
  const [fileName, setFileName] = useState('')
  const [urls, setUrls] = useState([])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        // try to get `url` column or single-column fallback
        const data = res.data
        let parsed = []
        if (data.length > 0 && data[0].url) {
          parsed = data.map(r => r.url).filter(Boolean)
        } else {
          // fallback: each row has first key
          parsed = data.map(r => Object.values(r)[0]).filter(Boolean)
        }
        setUrls(parsed)
      }
    })
  }

  async function submit() {
    if (!urls.length) return setError('No URLs parsed')
    setError(null)
    setLoading(true)
    try {
      const resp = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.message || 'Error')
      setResults(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-2xl shadow">
        <h1 className="text-2xl font-semibold mb-4">PageSpeed Dashboard</h1>
        <p className="text-sm text-slate-600 mb-4">Upload a CSV with a `url` column (or single column). The dashboard will fetch mobile & desktop PageSpeed metrics.</p>

        <div className="mb-4">
          <input type="file" accept=".csv" onChange={handleFile} />
          <div className="text-xs text-slate-500 mt-2">Parsed {urls.length} URLs — {fileName}</div>
        </div>

        <div className="flex gap-2">
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded"
            onClick={submit}
            disabled={loading || !urls.length}
          >{loading ? 'Running...' : 'Run Pagespeed'}</button>
          <button className="px-4 py-2 bg-gray-100 rounded" onClick={() => { setUrls([]); setResults(null); setFileName('') }}>Reset</button>
        </div>

        {error && <div className="mt-4 text-red-600">{error}</div>}

        {results && (
          <div className="mt-6">
            <h2 className="font-medium">Results</h2>
            <div className="overflow-x-auto">
              <table className="w-full mt-3 table-auto border-collapse">
                <thead>
                  <tr className="text-left bg-slate-100">
                    <th className="p-2 border">URL</th>
                    <th className="p-2 border">Device</th>
                    <th className="p-2 border">Perf</th>
                    <th className="p-2 border">LCP</th>
                    <th className="p-2 border">CLS</th>
                    <th className="p-2 border">TBT</th>
                    <th className="p-2 border">Screenshot</th>
                    <th className="p-2 border">Filmstrip frames</th>
                  </tr>
                </thead>
                <tbody>
                  {results.flat().map((r, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="p-2 border"><a className="text-indigo-600" href={r.url} target="_blank" rel="noreferrer">{r.url}</a></td>
                      <td className="p-2 border">{r.strategy}</td>
                      <td className="p-2 border">{r.performance ?? '—'}</td>
                      <td className="p-2 border">{r.lcp ?? '—'}</td>
                      <td className="p-2 border">{r.cls ?? '—'}</td>
                      <td className="p-2 border">{r.tbt ?? '—'}</td>
                      <td className="p-2 border">{r.screenshot ? <img src={r.screenshot} alt="screenshot" className="h-20 rounded" /> : '—'}</td>
                      <td className="p-2 border">{r.filmstripCount ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 text-sm text-slate-500">
          Tip: For thousands of URLs, consider batching and running overnight due to server timeouts/quota.
        </div>
      </div>
    </div>
  )
}
