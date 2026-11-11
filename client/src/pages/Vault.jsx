import { useState } from 'react';
import { api } from '../api/client.js';
import { createKeyBundle, unlockKeyBundle } from '../crypto/cryptoService.js';

// First visit: create an RSA key pair and protect it with a passphrase.
// Later visits: download the encrypted key bundle and unlock it.
export default function Vault({ hasKeys, onUnlocked }) {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!hasKeys) {
      if (pass.length < 10) return setError('Use at least 10 characters.');
      if (pass !== confirm) return setError('Passphrases do not match.');
    }

    setBusy(true);
    try {
      if (hasKeys) {
        const bundle = await api.getKeys();
        onUnlocked(await unlockKeyBundle(bundle, pass));
      } else {
        const { bundle, publicKey, privateKey } = await createKeyBundle(pass);
        await api.saveKeys(bundle);
        onUnlocked({ publicKey, privateKey });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card narrow stack" onSubmit={submit}>
        <h2>{hasKeys ? 'Unlock your vault' : 'Create your vault'}</h2>
        {hasKeys ? (
          <p className="muted">Enter your vault passphrase to unlock your private key.</p>
        ) : (
          <>
            <p className="muted">
              We will generate an RSA-3072 key pair in your browser. Your private key is encrypted
              with this passphrase before it is saved on the server.
            </p>
            <p className="warn">
              The passphrase is never sent to the server. If you forget it, your files cannot be
              recovered by anyone.
            </p>
          </>
        )}

        <label>
          Vault passphrase
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
        </label>
        {!hasKeys && (
          <label>
            Confirm passphrase
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
        )}

        <button className="primary block" disabled={busy || !pass}>
          {busy ? (hasKeys ? 'Unlocking…' : 'Generating keys…') : hasKeys ? 'Unlock' : 'Create vault'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
