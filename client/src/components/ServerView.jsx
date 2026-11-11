import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Shows exactly what the server has stored for a file, to demonstrate the
// zero-knowledge property: everything here is unreadable without the key.
export default function ServerView({ item, onClose }) {
  const [hex, setHex] = useState('Loading…');
  const { record, meta } = item;

  useEffect(() => {
    api
      .downloadBlob(record.id)
      .then((buf) => {
        const bytes = new Uint8Array(buf).slice(0, 192);
        const lines = [];
        for (let i = 0; i < bytes.length; i += 16) {
          lines.push(
            [...bytes.slice(i, i + 16)].map((b) => b.toString(16).padStart(2, '0')).join(' '),
          );
        }
        setHex(lines.join('\n') + (buf.byteLength > 192 ? '\n…' : ''));
      })
      .catch((err) => setHex(err.message));
  }, [record.id]);

  const short = (s) => (s.length > 64 ? `${s.slice(0, 64)}…` : s);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card stack" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>What the server stores</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted">
          You see this file as <b>{meta.name}</b>. The server only has the data below. Without your
          private key it cannot read the name, the AES key, or the contents.
        </p>

        <dl className="kv">
          <dt>id</dt>
          <dd>{record.id}</dd>
          <dt>encryptedMeta (file name)</dt>
          <dd>{short(record.encryptedMeta)}</dd>
          <dt>wrappedKey (AES key, RSA-OAEP)</dt>
          <dd>{short(record.wrappedKey)}</dd>
          <dt>iv (AES-GCM nonce)</dt>
          <dd>{record.iv}</dd>
          <dt>size</dt>
          <dd>{record.size} bytes</dd>
        </dl>

        <div>
          <div className="label">Stored blob (first bytes, hex)</div>
          <pre className="hex">{hex}</pre>
        </div>
      </div>
    </div>
  );
}
