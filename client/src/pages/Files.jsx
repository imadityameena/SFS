import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { encryptFile, decryptFile, decryptMetadata } from '../crypto/cryptoService.js';
import ServerView from '../components/ServerView.jsx';

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

export default function Files({ keys }) {
  const [items, setItems] = useState([]); // [{ record, meta }]
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inspect, setInspect] = useState(null);
  const inputRef = useRef();

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      const records = await api.listFiles();
      // File names are encrypted on the server; decrypt them here to show the list.
      const decrypted = await Promise.all(
        records.map(async (record) => {
          try {
            return { record, meta: await decryptMetadata(record, keys.privateKey) };
          } catch {
            return { record, meta: { name: '⚠ cannot decrypt', type: '' } };
          }
        }),
      );
      setItems(decrypted);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpload(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    setError('');
    setBusy(true);
    try {
      for (const file of files) {
        setStatus(`Encrypting ${file.name}…`);
        const t0 = performance.now();
        const bytes = await file.arrayBuffer();
        const encrypted = await encryptFile(
          bytes,
          { name: file.name, type: file.type || 'application/octet-stream' },
          keys.publicKey,
        );
        const t1 = performance.now();

        setStatus(`Uploading ${file.name} (encrypted)…`);
        await api.uploadFile(encrypted);
        const t2 = performance.now();

        setStatus(
          `✔ ${file.name}: encrypted in ${(t1 - t0).toFixed(0)} ms, uploaded in ${(t2 - t1).toFixed(0)} ms`,
        );
      }
      await refresh();
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload({ record, meta }) {
    setError('');
    try {
      setStatus(`Downloading ${meta.name}…`);
      const t0 = performance.now();
      const ciphertext = await api.downloadBlob(record.id);
      const t1 = performance.now();
      setStatus(`Decrypting ${meta.name}…`);
      const plaintext = await decryptFile(record, ciphertext, keys.privateKey);
      const t2 = performance.now();

      // Hand the decrypted bytes to the browser as a download.
      const url = URL.createObjectURL(new Blob([plaintext], { type: meta.type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setStatus(
        `✔ ${meta.name}: downloaded in ${(t1 - t0).toFixed(0)} ms, decrypted in ${(t2 - t1).toFixed(0)} ms`,
      );
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  }

  async function handleDelete({ record, meta }) {
    if (!confirm(`Delete "${meta.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteFile(record.id);
      setItems((prev) => prev.filter((i) => i.record.id !== record.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <div>
            <h2>Upload</h2>
            <p className="muted">
              Files are encrypted with AES-256-GCM in your browser. Only ciphertext is uploaded.
            </p>
          </div>
          <button className="primary" disabled={busy} onClick={() => inputRef.current.click()}>
            {busy ? 'Working…' : 'Choose files'}
          </button>
          <input ref={inputRef} type="file" multiple hidden onChange={handleUpload} />
        </div>
        {status && <p className="status">{status}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>My files ({items.length})</h2>
        {items.length === 0 ? (
          <p className="muted">No files yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Encrypted size</th>
                  <th>Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.record.id}>
                    <td className="name">{item.meta.name}</td>
                    <td>{formatBytes(item.record.size)}</td>
                    <td>{new Date(item.record.createdAt).toLocaleString()}</td>
                    <td className="actions">
                      <button onClick={() => handleDownload(item)}>Download</button>
                      <button className="ghost" onClick={() => setInspect(item)}>
                        Server view
                      </button>
                      <button className="ghost danger" onClick={() => handleDelete(item)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {inspect && <ServerView item={inspect} onClose={() => setInspect(null)} />}
    </div>
  );
}
