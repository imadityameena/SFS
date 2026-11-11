import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { encryptFile, decryptFile, decryptMetadata } from '../crypto/cryptoService.js';
import ServerView from '../components/ServerView.jsx';
import { Icon, Spinner } from '../components/icons.jsx';

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

function fileType(name) {
  const ext = name.includes('.') ? name.split('.').pop() : '';
  return ext && ext.length <= 5 ? ext.toUpperCase() : 'File';
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function Files({ keys }) {
  const [items, setItems] = useState(null); // null = loading, then [{ record, meta }]
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(null); // { type: 'busy' | 'ok' | 'error', text }
  const [busy, setBusy] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [inspect, setInspect] = useState(null);
  const inputRef = useRef();
  const dragDepth = useRef(0);

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
            return { record, meta: { name: '(cannot decrypt)', type: '' } };
          }
        }),
      );
      decrypted.sort((a, b) => new Date(b.record.createdAt) - new Date(a.record.createdAt));
      setItems(decrypted);
    } catch (err) {
      setItems((prev) => prev || []);
      setStatus({ type: 'error', text: err.message });
    }
  }

  async function uploadFiles(files) {
    if (!files.length || busy) return;
    setBusy(true);
    try {
      for (const [i, file] of files.entries()) {
        const count = files.length > 1 ? ` (${i + 1} of ${files.length})` : '';
        setStatus({ type: 'busy', text: `Encrypting ${file.name}${count}` });
        const t0 = performance.now();
        const bytes = await file.arrayBuffer();
        const encrypted = await encryptFile(
          bytes,
          { name: file.name, type: file.type || 'application/octet-stream' },
          keys.publicKey,
        );
        const t1 = performance.now();

        setStatus({ type: 'busy', text: `Uploading ${file.name}${count}` });
        await api.uploadFile(encrypted);
        const t2 = performance.now();

        setStatus({
          type: 'ok',
          text: `Uploaded ${file.name}. Encrypted in ${(t1 - t0).toFixed(0)} ms, uploaded in ${(t2 - t1).toFixed(0)} ms.`,
        });
      }
      await refresh();
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  function onPick(e) {
    const files = [...e.target.files];
    e.target.value = '';
    uploadFiles(files);
  }

  // Drag and drop anywhere on the page. A counter avoids flicker over child elements.
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const dropHandlers = {
    onDragEnter(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver(e) {
      if (hasFiles(e)) e.preventDefault();
    },
    onDragLeave() {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      uploadFiles([...e.dataTransfer.files]);
    },
  };

  async function handleDownload({ record, meta }) {
    setWorkingId(record.id);
    try {
      setStatus({ type: 'busy', text: `Downloading ${meta.name}` });
      const t0 = performance.now();
      const ciphertext = await api.downloadBlob(record.id);
      const t1 = performance.now();
      setStatus({ type: 'busy', text: `Decrypting ${meta.name}` });
      const plaintext = await decryptFile(record, ciphertext, keys.privateKey);
      const t2 = performance.now();

      // Hand the decrypted bytes to the browser as a download.
      const url = URL.createObjectURL(new Blob([plaintext], { type: meta.type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setStatus({
        type: 'ok',
        text: `Downloaded ${meta.name}. Downloaded in ${(t1 - t0).toFixed(0)} ms, decrypted in ${(t2 - t1).toFixed(0)} ms.`,
      });
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setWorkingId(null);
    }
  }

  async function handleDelete({ record, meta }) {
    if (!confirm(`Delete "${meta.name}"? This cannot be undone.`)) return;
    setWorkingId(record.id);
    try {
      await api.deleteFile(record.id);
      setItems((prev) => prev.filter((i) => i.record.id !== record.id));
      setStatus({ type: 'ok', text: `Deleted ${meta.name}.` });
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setWorkingId(null);
    }
  }

  const list = items || [];
  const totalSize = list.reduce((sum, i) => sum + i.record.size, 0);
  const q = query.trim().toLowerCase();
  const visible = q ? list.filter((i) => i.meta.name.toLowerCase().includes(q)) : list;
  const browse = () => !busy && inputRef.current.click();

  return (
    <div className={`page ${dragging ? 'is-dragging' : ''}`} {...dropHandlers}>
      <div className="page-head">
        <div>
          <h1>Files</h1>
          <p className="muted">
            {items
              ? `${list.length} ${list.length === 1 ? 'file' : 'files'}, ${formatBytes(totalSize)} stored`
              : 'Loading'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={browse} disabled={busy}>
          {busy ? <Spinner size={14} /> : <Icon name="upload" size={16} />}
          Upload files
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={onPick} />
      </div>

      <button type="button" className="dropzone" onClick={browse} disabled={busy}>
        {dragging ? (
          <strong>Release to encrypt and upload</strong>
        ) : (
          <>
            Drag files here, or <span className="link">choose files</span>. They are encrypted in
            this browser before they are sent.
          </>
        )}
      </button>

      {status && (
        <div className={`notice notice-${status.type} notice-row`} role="status">
          {status.type === 'busy' && <Spinner size={14} />}
          <span className="notice-text">{status.text}</span>
          {status.type !== 'busy' && (
            <button className="link-btn" onClick={() => setStatus(null)}>
              Dismiss
            </button>
          )}
        </div>
      )}

      <section className="card card-flush">
        <div className="toolbar">
          <h2>All files</h2>
          {list.length > 0 && (
            <div className="search">
              <Icon name="search" size={15} />
              <input
                className="input input-sm"
                type="search"
                placeholder="Search by name"
                aria-label="Search files by name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
        </div>

        {items === null ? (
          <p className="table-empty row muted">
            <Spinner size={14} /> Loading files
          </p>
        ) : list.length === 0 ? (
          <div className="table-empty">
            <p>No files yet.</p>
            <p className="muted">Upload a file to get started.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="table-empty">
            <p>No files match "{query}".</p>
            <button className="link-btn" onClick={() => setQuery('')}>
              Clear search
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="files-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="col-type">Type</th>
                  <th className="col-size num">Size</th>
                  <th className="col-date">Uploaded</th>
                  <th className="col-actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const working = workingId === item.record.id;
                  const created = dateFormat.format(new Date(item.record.createdAt));
                  return (
                    <tr key={item.record.id}>
                      <td className="col-name">
                        <span className="file-name" title={item.meta.name}>
                          {item.meta.name}
                        </span>
                        <span className="file-sub">
                          {formatBytes(item.record.size)}, {created}
                        </span>
                      </td>
                      <td className="col-type">
                        <span className="type-tag">{fileType(item.meta.name)}</span>
                      </td>
                      <td className="col-size num">{formatBytes(item.record.size)}</td>
                      <td className="col-date">{created}</td>
                      <td className="col-actions">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleDownload(item)}
                          disabled={working}
                          aria-label={`Download ${item.meta.name}`}
                        >
                          {working ? <Spinner size={13} /> : <Icon name="download" size={15} />}
                          <span className="btn-label">Download</span>
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setInspect(item)}
                          aria-label={`Show stored data for ${item.meta.name}`}
                        >
                          <Icon name="server" size={15} />
                          <span className="btn-label">Server view</span>
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-danger"
                          onClick={() => handleDelete(item)}
                          disabled={working}
                          aria-label={`Delete ${item.meta.name}`}
                          title="Delete"
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {inspect && <ServerView item={inspect} onClose={() => setInspect(null)} />}
    </div>
  );
}
