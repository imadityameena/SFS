import { useState } from 'react';
import { encryptFile, decryptFile, randomBytes } from '../crypto/cryptoService.js';

// Measures how much time client-side encryption adds, for several file sizes.
// Runs entirely in the browser; nothing is uploaded.
const SIZES_MB = [1, 5, 10, 25, 50];
const RUNS = 3;

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export default function Benchmark({ keys }) {
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');

  async function run() {
    setRunning(true);
    setRows([]);
    const results = [];
    for (const mb of SIZES_MB) {
      setProgress(`Testing ${mb} MB…`);
      const data = randomBytes(mb * 1024 * 1024);
      const enc = [];
      const dec = [];
      for (let i = 0; i < RUNS; i++) {
        const t0 = performance.now();
        const e = await encryptFile(data, { name: 'bench.bin', type: '' }, keys.publicKey);
        const t1 = performance.now();
        await decryptFile(e, e.blob, keys.privateKey);
        const t2 = performance.now();
        enc.push(t1 - t0);
        dec.push(t2 - t1);
      }
      const encMs = avg(enc);
      const decMs = avg(dec);
      results.push({
        mb,
        encMs,
        decMs,
        encSpeed: mb / (encMs / 1000),
        decSpeed: mb / (decMs / 1000),
      });
      setRows([...results]);
      // Let the UI repaint between sizes.
      await new Promise((r) => setTimeout(r, 0));
    }
    setProgress('');
    setRunning(false);
  }

  function exportCsv() {
    const lines = ['size_mb,encrypt_ms,decrypt_ms,encrypt_mb_s,decrypt_mb_s'];
    for (const r of rows) {
      lines.push(
        [r.mb, r.encMs.toFixed(1), r.decMs.toFixed(1), r.encSpeed.toFixed(1), r.decSpeed.toFixed(1)].join(','),
      );
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'benchmark.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card stack">
      <div className="row between">
        <div>
          <h2>Encryption overhead benchmark</h2>
          <p className="muted">
            Encrypts and decrypts random data of each size ({RUNS} runs, averaged) using the same
            code as real uploads: AES-256-GCM for data + RSA-OAEP for the key.
          </p>
        </div>
        <div className="row">
          {rows.length > 0 && !running && <button onClick={exportCsv}>Export CSV</button>}
          <button className="primary" onClick={run} disabled={running}>
            {running ? 'Running…' : 'Run benchmark'}
          </button>
        </div>
      </div>
      {progress && <p className="status">{progress}</p>}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File size</th>
                <th>Encrypt time</th>
                <th>Decrypt time</th>
                <th>Encrypt speed</th>
                <th>Decrypt speed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.mb}>
                  <td>{r.mb} MB</td>
                  <td>{r.encMs.toFixed(1)} ms</td>
                  <td>{r.decMs.toFixed(1)} ms</td>
                  <td>{r.encSpeed.toFixed(0)} MB/s</td>
                  <td>{r.decSpeed.toFixed(0)} MB/s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
