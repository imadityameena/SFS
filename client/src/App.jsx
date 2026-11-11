import { useEffect, useState } from 'react';
import { api, tokenStore } from './api/client.js';
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
  }

  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Login onLoggedIn={loadUser} error={error} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🔐 CipherVault</div>
        {keys && (
          <nav className="tabs">
            <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
              My files
            </button>
            <button
              className={tab === 'bench' ? 'active' : ''}
              onClick={() => setTab('bench')}
            >
              Benchmark
            </button>
          </nav>
        )}
        <div className="user">
          {user.avatar && <img src={user.avatar} alt="" />}
          <span>{user.name}</span>
          {keys && (
            <button className="ghost" onClick={() => setKeys(null)} title="Forget keys from memory">
              Lock
            </button>
          )}
          <button className="ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <main>
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
