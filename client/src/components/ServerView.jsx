import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { Icon, Spinner } from './icons.jsx';

const HEX_BYTES = 192;

// Shows exactly what the server has stored for a file, to demonstrate the
// zero-knowledge property: everything here is unreadable without the key.
export default function ServerView({ item, onClose }) {
  const [hex, setHex] = useState(null); // null = loading, else { lines, more } or { error }
  const closeRef = useRef();
  const { record, meta } = item;

  useEffect(() => {
    api
      .downloadBlob(record.id)
      .then((buf) => {
        const bytes = new Uint8Array(buf).slice(0, HEX_BYTES);
        const lines = [];
        for (let i = 0; i < bytes.length; i += 16) {
          lines.push({
            offset: i.toString(16).padStart(4, '0'),
            hex: [...bytes.slice(i, i + 16)].map((b) => b.toString(16).padStart(2, '0')).join(' '),
          });
        }
        setHex({ lines, more: buf.byteLength > HEX_BYTES });
      })
      .catch((err) => setHex({ error: err.message }));
  }, [record.id]);

  // Close on Escape, and move focus into the dialog.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const short = (s, n = 72) => (s.length > n ? `${s.slice(0, n)}…` : s);

  const rows = [
    ['File name, decrypted in your browser', meta.name, null, false],
    ['File name, as stored', short(record.encryptedMeta), 'Encrypted with AES-256-GCM', true],
    ['File ID', record.id, 'Random identifier, unrelated to the file name', true],
    ['Wrapped file key', short(record.wrappedKey), 'AES key, encrypted with your RSA-OAEP public key', true],
    ['IV', record.iv, 'Random AES-GCM nonce', true],
    ['Size', `${record.size.toLocaleString()} bytes`, 'Visible to the server', false],
  ];

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sv-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="sv-title">Stored data</h2>
            <p className="muted">
              Everything the server holds for this file. None of it can be read without your
              private key.
            </p>
          </div>
          <button
            ref={closeRef}
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <table className="kv-table">
          <tbody>
            {rows.map(([label, value, note, mono]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>
                  <span className={mono ? 'mono' : 'strong'}>{value}</span>
                  {note && <span className="kv-note">{note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div>
          <h3 className="sub-head">Encrypted contents, first {HEX_BYTES} bytes</h3>
          <div className="hex">
            {hex === null ? (
              <span className="row muted">
                <Spinner size={13} /> Loading
              </span>
            ) : hex.error ? (
              <span className="error">{hex.error}</span>
            ) : (
              <>
                {hex.lines.map((l) => (
                  <div key={l.offset} className="hex-line">
                    <span className="hex-offset">{l.offset}</span>
                    <span>{l.hex}</span>
                  </div>
                ))}
                {hex.more && <div className="hex-offset">…</div>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
