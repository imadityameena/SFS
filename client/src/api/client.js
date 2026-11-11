// Thin wrapper around fetch that attaches the JWT to every request.
const TOKEN_KEY = 'cv_token';

export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

async function request(path, { method = 'GET', json, body, raw } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const res = await fetch(`/api${path}`, { method, headers, body });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = (await res.json()).error || message;
    } catch {}
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return raw ? res.arrayBuffer() : res.json();
}

export const api = {
  providers: () => request('/auth/providers'),
  devLogin: (username) => request('/auth/dev-login', { method: 'POST', json: { username } }),
  me: () => request('/auth/me'),

  getKeys: () => request('/keys'),
  saveKeys: (bundle) => request('/keys', { method: 'POST', json: bundle }),

  listFiles: () => request('/files'),
  uploadFile: (encrypted) => {
    const form = new FormData();
    form.append('wrappedKey', encrypted.wrappedKey);
    form.append('iv', encrypted.iv);
    form.append('encryptedMeta', encrypted.encryptedMeta);
    form.append('metaIv', encrypted.metaIv);
    form.append('blob', new Blob([encrypted.blob]), 'encrypted.bin');
    return request('/files', { method: 'POST', body: form });
  },
  downloadBlob: (id) => request(`/files/${id}/blob`, { raw: true }),
  deleteFile: (id) => request(`/files/${id}`, { method: 'DELETE' }),
};
