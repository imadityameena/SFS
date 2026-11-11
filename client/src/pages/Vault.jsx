import { useState } from 'react';
import { api } from '../api/client.js';
import { createKeyBundle, unlockKeyBundle } from '../crypto/cryptoService.js';
import { Icon, Spinner } from '../components/icons.jsx';

const MIN_LENGTH = 10;
const STRENGTH = [
  { label: `At least ${MIN_LENGTH} characters`, tone: 'danger' },
  { label: 'Weak', tone: 'danger' },
  { label: 'Fair', tone: 'warn' },
  { label: 'Good', tone: 'ok' },
  { label: 'Strong', tone: 'ok' },
];

// A rough guide only: rewards length first, then a mix of character types.
function strength(p) {
  if (p.length < MIN_LENGTH) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  let score = 1;
  if (p.length >= 14) score++;
  if (classes >= 3) score++;
  if (p.length >= 20 || (p.length >= 14 && classes === 4)) score++;
  return Math.min(score, 4);
}

function PasswordInput({ id, value, onChange, autoFocus, autoComplete, describedBy }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input
        id={id}
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        className="input-action"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide passphrase' : 'Show passphrase'}
        title={show ? 'Hide' : 'Show'}
      >
        <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
      </button>
    </div>
  );
}

// First visit: create an RSA key pair and protect it with a passphrase.
// Later visits: download the encrypted key bundle and unlock it.
export default function Vault({ hasKeys, onUnlocked }) {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const level = strength(pass);
  const mismatch = !hasKeys && confirm.length > 0 && confirm !== pass;

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!hasKeys) {
      if (pass.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
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
    <div className="narrow-page">
      <form className="card form-card" onSubmit={submit}>
        <div>
          <h1>{hasKeys ? 'Unlock your files' : 'Set a vault passphrase'}</h1>
          <p className="muted">
            {hasKeys
              ? 'Enter your vault passphrase. Your private key is decrypted in this tab only.'
              : 'This passphrase encrypts your private key. You will need it each time you sign in.'}
          </p>
        </div>

        {!hasKeys && (
          <p className="body-note">
            An RSA-3072 key pair is generated in this browser. The private key is encrypted with
            your passphrase (PBKDF2-SHA256, 600,000 iterations) before it is stored on the server.
          </p>
        )}

        <div className="field">
          <label htmlFor="pass">Passphrase</label>
          <PasswordInput
            id="pass"
            value={pass}
            onChange={setPass}
            autoFocus
            autoComplete={hasKeys ? 'current-password' : 'new-password'}
            describedBy={!hasKeys ? 'pass-strength' : undefined}
          />
          {!hasKeys && pass.length > 0 && (
            <div id="pass-strength" className={`meter tone-${STRENGTH[level].tone}`} aria-live="polite">
              <div className="meter-track">
                <span style={{ width: `${(Math.max(level, 0.5) / 4) * 100}%` }} />
              </div>
              <span className="meter-label">{STRENGTH[level].label}</span>
            </div>
          )}
        </div>

        {!hasKeys && (
          <div className="field">
            <label htmlFor="confirm">Confirm passphrase</label>
            <PasswordInput
              id="confirm"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
            {mismatch && <span className="field-error">Passphrases do not match.</span>}
          </div>
        )}

        {!hasKeys && (
          <p className="notice notice-warn">
            The passphrase is never sent to the server. If you forget it, your files cannot be
            recovered.
          </p>
        )}

        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}

        <button className="btn btn-primary btn-block" disabled={busy || !pass}>
          {busy && <Spinner size={14} />}
          {busy
            ? hasKeys
              ? 'Unlocking'
              : 'Generating keys'
            : hasKeys
              ? 'Unlock'
              : 'Create vault'}
        </button>
      </form>
    </div>
  );
}
