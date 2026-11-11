import { useEffect, useState } from 'react';
import { api, tokenStore } from '../api/client.js';

export default function Login({ onLoggedIn, error: initialError }) {
  const [providers, setProviders] = useState(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState(initialError || '');

  useEffect(() => {
    api
      .providers()
      .then(setProviders)
      .catch(() => setError('Cannot reach the server. Is it running on port 4000?'));
  }, []);

  async function devLogin(e) {
    e.preventDefault();
    setError('');
    try {
      const { token } = await api.devLogin(username);
      tokenStore.set(token);
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="center">
      <div className="card narrow">
        <h1>🔐 CipherVault</h1>
        <p className="muted">
          Secure file storage with end-to-end encryption. Files are encrypted in your browser
          before upload, so the server never sees their contents.
        </p>

        {providers?.github && (
          // Full-page navigation: starts the OAuth2 flow on the server.
          <a className="button primary block" href="/api/auth/github">
            Sign in with GitHub
          </a>
        )}

        {providers?.dev && (
          <form onSubmit={devLogin} className="stack">
            {providers.github && <div className="divider">or (development only)</div>}
            <label>
              Dev login username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. aditya"
              />
            </label>
            <button className="block">Continue</button>
          </form>
        )}

        {providers && !providers.github && !providers.dev && (
          <p className="error">No login method is enabled. Check server/.env.</p>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
