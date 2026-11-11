import { useEffect, useState } from 'react';
import { api, tokenStore } from './api/client.js';
import { Icon, Spinner } from './components/icons.jsx';
import Wordmark from './components/Wordmark.jsx';
import Login from './pages/Login.jsx';
import Vault from './pages/Vault.jsx';
import Files from './pages/Files.jsx';
import Benchmark from './pages/Benchmark.jsx';

// Screens:  Login  ->  Vault (create / unlock keys)  ->  Files | Benchmark
export default function App() {
  const [user, setUser] = useState(null);
  const [keys, setKeys] = useState(null); // { publicKey, privateKey } – memory only
  const [tab, setTab] = useState('files');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // After GitHub login, the server redirects to /#token=... (or #error=...)
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get('token')) tokenStore.set(hash.get('token'));
    if (hash.get('error')) setError(hash.get('error'));
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    loadUser();
  }, []);

  async function loadUser() {
    setLoading(true);
    try {
      if (tokenStore.get()) setUser(await api.me());
    } catch {
      tokenStore.clear(); // expired or invalid token
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    tokenStore.clear();
    setKeys(null);
    setUser(null);
    setTab('files');
  }

  if (loading) {
    return (
      <div className="screen-center">
        <Spinner size={20} />
      </div>
    );
  }
  if (!user) return <Login onLoggedIn={loadUser} error={error} />;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Wordmark />

          {keys && (
            <nav className="nav" aria-label="Sections">
              <button
                className={tab === 'files' ? 'is-active' : ''}
                aria-current={tab === 'files' ? 'page' : undefined}
                onClick={() => setTab('files')}
              >
                Files
              </button>
              <button
                className={tab === 'bench' ? 'is-active' : ''}
                aria-current={tab === 'bench' ? 'page' : undefined}
                onClick={() => setTab('bench')}
              >
                Benchmark
              </button>
            </nav>
          )}

          <div className="topbar-right">
            <span className="lock-state" title={keys ? 'Your private key is loaded in this tab' : 'Your private key is not loaded'}>
              <Icon name={keys ? 'unlock' : 'lock'} size={14} />
              <span>{keys ? 'Unlocked' : 'Locked'}</span>
            </span>
            <span className="topbar-sep" aria-hidden="true" />
            <span className="user" title={user.name}>
              {user.avatar ? (
                <img src={user.avatar} alt="" />
              ) : (
                <span className="avatar-fallback">{user.name?.[0]?.toUpperCase()}</span>
              )}
              <span className="user-name">{user.name}</span>
            </span>
            {keys && (
              <button className="btn btn-ghost btn-sm" onClick={() => setKeys(null)} title="Remove your keys from memory">
                Lock
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="content">
        {!keys ? (
          <Vault
            hasKeys={user.hasKeys}
            onUnlocked={(k) => {
              setKeys(k);
              setUser({ ...user, hasKeys: true });
            }}
          />
        ) : tab === 'files' ? (
          <Files keys={keys} />
        ) : (
          <Benchmark keys={keys} />
        )}
      </main>
    </div>
  );
}
