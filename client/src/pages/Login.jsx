import { useEffect, useState } from 'react';
import { api, tokenStore } from '../api/client.js';
import { APP_NAME } from '../brand.js';
import Wordmark from '../components/Wordmark.jsx';
import { GithubMark, Spinner } from '../components/icons.jsx';

export default function Login({ onLoggedIn, error: initialError }) {
  const [providers, setProviders] = useState(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState(initialError || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .providers()
      .then(setProviders)
      .catch(() => setError('Cannot reach the server. Check that it is running on port 4000.'));
  }, []);

  async function devLogin(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token } = await api.devLogin(username);
      tokenStore.set(token);
      onLoggedIn();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-box">
        <Wordmark />

        <div className="card auth-card">
          <div>
            <h1>Sign in to {APP_NAME}</h1>
            <p className="muted">Use your GitHub account to access your files.</p>
          </div>

          {!providers && !error && (
            <p className="row muted">
              <Spinner size={14} /> Connecting to server
            </p>
          )}

          {providers?.github && (
            // Full-page navigation: starts the OAuth2 flow on the server.
            <a className="btn btn-github btn-block" href="/api/auth/github">
              <GithubMark size={16} />
              Continue with GitHub
            </a>
          )}

          {providers?.dev && (
            <form onSubmit={devLogin} className="stack">
              {providers.github && <div className="or">or</div>}
              <div className="field">
                <label htmlFor="dev-user">Development login</label>
                <input
                  id="dev-user"
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  autoComplete="username"
                />
                <span className="hint">For local testing only. Disable it in server/.env.</span>
              </div>
              <button className="btn btn-secondary btn-block" disabled={busy || !username.trim()}>
                {busy && <Spinner size={14} />}
                Continue
              </button>
            </form>
          )}

          {providers && !providers.github && !providers.dev && (
            <p className="notice notice-error">No sign-in method is enabled. Check server/.env.</p>
          )}
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <p className="auth-note">
          Files are encrypted in your browser before upload (AES-256-GCM, one key per file). The
          server stores only encrypted data and cannot read your files or their names.
        </p>
      </div>
    </div>
  );
}
