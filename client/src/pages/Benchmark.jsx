import { useState } from 'react';
import { encryptFile, decryptFile, randomBytes } from '../crypto/cryptoService.js';
import { Spinner } from '../components/icons.jsx';

// Measures how much time client-side encryption adds, for several file sizes.
// Runs entirely in the browser; nothing is uploaded.
const SIZES_MB = [1, 5, 10, 25, 50];
const RUNS = 3;

const SERIES = [
  { key: 'encSpeed', label: 'Encrypt', cls: 's1' },
  { key: 'decSpeed', label: 'Decrypt', cls: 's2' },
];

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n) => Math.round(n).toLocaleString();

// Round the axis maximum up to a clean number (1, 2, 2.5 or 5 x 10^n per step).
function niceScale(max, steps = 4) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const raw = max / steps;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(t);
  return { top, ticks };
}

function SpeedChart({ rows }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...rows.flatMap((r) => SERIES.map((s) => r[s.key])));
  const { top, ticks } = niceScale(max);
  const n = SIZES_MB.length;

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <div>
          <h3>Throughput by file size</h3>
          <span className="muted small">MB/s, higher is faster</span>
        </div>
        <ul className="legend">
          {SERIES.map((s) => (
            <li key={s.key}>
              <span className={`swatch ${s.cls}`} />
              {s.label}
            </li>
          ))}
        </ul>
      </figcaption>

      <div className="chart-plot">
        <div className={`chart-area ${hover !== null ? 'has-hover' : ''}`}>
          {ticks.map((t) => (
            <div key={t} className="gridline" style={{ bottom: `${(t / top) * 100}%` }}>
              <span>{fmt(t)}</span>
            </div>
          ))}

          {SIZES_MB.map((mb, i) => {
            const r = rows.find((row) => row.mb === mb);
            const label = r
              ? `${mb} MB: encrypt ${fmt(r.encSpeed)} MB/s, decrypt ${fmt(r.decSpeed)} MB/s`
              : `${mb} MB: not measured yet`;
            return (
              <div
                key={mb}
                className={`chart-group ${hover === i ? 'is-hover' : ''}`}
                tabIndex={r ? 0 : -1}
                aria-label={label}
                onMouseEnter={() => r && setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => r && setHover(i)}
                onBlur={() => setHover(null)}
              >
                {SERIES.map((s) => (
                  <span
                    key={s.key}
                    className={`bar ${s.cls}`}
                    style={{ height: r ? `${(r[s.key] / top) * 100}%` : 0 }}
                  />
                ))}
              </div>
            );
          })}

          {hover !== null &&
            (() => {
              const r = rows.find((row) => row.mb === SIZES_MB[hover]);
              if (!r) return null;
              const tallest = Math.max(r.encSpeed, r.decSpeed) / top;
              const edge = hover === 0 ? 'edge-left' : hover === n - 1 ? 'edge-right' : '';
              return (
                <div
                  className={`tooltip ${edge}`}
                  style={{ left: `${((hover + 0.5) / n) * 100}%`, bottom: `${tallest * 100}%` }}
                >
                  <strong>{r.mb} MB file</strong>
                  {SERIES.map((s) => (
                    <div key={s.key} className="tooltip-row">
                      <span className={`swatch ${s.cls}`} />
                      <span>{s.label}</span>
                      <span className="tooltip-value">{fmt(r[s.key])} MB/s</span>
                    </div>
                  ))}
                  <div className="tooltip-row muted">
                    <span />
                    <span>Time</span>
                    <span className="tooltip-value">
                      {r.encMs.toFixed(0)} / {r.decMs.toFixed(0)} ms
                    </span>
                  </div>
                </div>
              );
            })()}
        </div>
        <div className="chart-x">
          {SIZES_MB.map((mb) => (
            <span key={mb}>{mb} MB</span>
          ))}
        </div>
      </div>
    </figure>
  );
}

export default function Benchmark({ keys }) {
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(null);

  async function run() {
    setRunning(true);
    setRows([]);
    const results = [];
    for (const mb of SIZES_MB) {
      setCurrent(mb);
      // Let the UI repaint before the heavy work starts.
      await new Promise((r) => setTimeout(r, 30));
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
    }
    setCurrent(null);
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

  const done = rows.length === SIZES_MB.length;
  const ten = rows.find((r) => r.mb === 10);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Benchmark</h1>
          <p className="muted">
            Encrypts and decrypts random data of each size ({RUNS} runs, averaged) using the same
            code as real uploads. Runs in this browser; nothing is uploaded.
          </p>
        </div>
        <div className="row">
          {done && !running && (
            <button className="btn btn-secondary" onClick={exportCsv}>
              Export CSV
            </button>
          )}
          <button className="btn btn-primary" onClick={run} disabled={running}>
            {running && <Spinner size={14} />}
            {running ? 'Running' : rows.length ? 'Run again' : 'Run benchmark'}
          </button>
        </div>
      </div>

      {running && (
        <div className="progress-card card">
          <div className="row between">
            <span>
              Testing <strong>{current} MB</strong>
            </span>
            <span className="muted small">
              {rows.length} of {SIZES_MB.length} sizes
            </span>
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={SIZES_MB.length} aria-valuenow={rows.length}>
            <span style={{ width: `${(rows.length / SIZES_MB.length) * 100}%` }} />
          </div>
        </div>
      )}

      {rows.length === 0 && !running ? (
        <section className="card table-empty">
          <p>No results yet.</p>
          <p className="muted">
            Run the benchmark to measure AES-256-GCM and RSA-OAEP time for files from 1 to 50 MB.
          </p>
        </section>
      ) : (
        rows.length > 0 && (
          <>
            {done && (
              <dl className="card summary">
                <div>
                  <dt>Average encrypt speed</dt>
                  <dd>
                    {fmt(avg(rows.map((r) => r.encSpeed)))} <small>MB/s</small>
                  </dd>
                </div>
                <div>
                  <dt>Average decrypt speed</dt>
                  <dd>
                    {fmt(avg(rows.map((r) => r.decSpeed)))} <small>MB/s</small>
                  </dd>
                </div>
                {ten && (
                  <div>
                    <dt>Encrypting a 10 MB file</dt>
                    <dd>
                      {ten.encMs.toFixed(0)} <small>ms</small>
                    </dd>
                  </div>
                )}
              </dl>
            )}

            <section className="card">
              <SpeedChart rows={rows} />
            </section>

            <section className="card">
              <h2 className="table-title">Results</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>File size</th>
                      <th className="num">Encrypt time</th>
                      <th className="num">Decrypt time</th>
                      <th className="num">Encrypt speed</th>
                      <th className="num">Decrypt speed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.mb}>
                        <td>{r.mb} MB</td>
                        <td className="num">{r.encMs.toFixed(1)} ms</td>
                        <td className="num">{r.decMs.toFixed(1)} ms</td>
                        <td className="num">{fmt(r.encSpeed)} MB/s</td>
                        <td className="num">{fmt(r.decSpeed)} MB/s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
