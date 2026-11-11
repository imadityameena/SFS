// End-to-end + zero-knowledge check.
//
// Start the server first (with ALLOW_DEV_LOGIN=true), then:
//   node scripts/zero-knowledge-check.mjs
// For a server using MongoDB, also pass its connection string so the stored
// data can be scanned:
//   MONGODB_URI=mongodb://... API=http://localhost:4000/api node scripts/zero-knowledge-check.mjs
//
// It acts like a real client: logs in, creates a key pair, encrypts and
// uploads a file, downloads and decrypts it. Then it searches EVERYTHING
// the server stored for the secret text, the file name and the passphrase.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createKeyBundle,
  unlockKeyBundle,
  encryptFile,
  decryptFile,
  decryptMetadata,
} from '../client/src/crypto/cryptoService.js';

const API = process.env.API || 'http://localhost:4000/api';
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'data');

const SECRET_TEXT = `ZK-CHECK-SECRET-${Date.now()}`;
const FILE_NAME = `confidential-${Date.now()}.txt`;
const PASSPHRASE = `passphrase-${Date.now()}`;
const USERNAME = `zkcheck${Date.now() % 100000}`;

let token;
async function call(p, opts = {}) {
  const res = await fetch(API + p, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`${p} -> ${res.status} ${await res.text()}`);
  return opts.raw ? res.arrayBuffer() : res.json();
}
const ok = (msg) => console.log(`  [ok] ${msg}`);

console.log('1. Login (dev login) and get JWT');
token = (await call('/auth/dev-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USERNAME }),
})).token;
ok(`token received (${token.slice(0, 20)}…)`);

console.log('2. Requests without a JWT are rejected');
const noAuth = await fetch(API + '/files');
if (noAuth.status !== 401) throw new Error('expected 401');
ok('GET /files without token -> 401');

console.log('3. Create RSA key pair, upload encrypted private key');
const { bundle, publicKey } = await createKeyBundle(PASSPHRASE);
await call('/keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(bundle),
});
ok('key bundle stored');

console.log('4. Encrypt file locally and upload');
const plaintext = new TextEncoder().encode(`${SECRET_TEXT}\n`.repeat(200));
const enc = await encryptFile(plaintext, { name: FILE_NAME, type: 'text/plain' }, publicKey);
const form = new FormData();
for (const k of ['wrappedKey', 'iv', 'encryptedMeta', 'metaIv']) form.append(k, enc[k]);
form.append('blob', new Blob([enc.blob]), 'encrypted.bin');
const record = await call('/files', { method: 'POST', body: form });
ok(`uploaded file id ${record.id}`);

console.log('5. Unlock keys again (simulating a new session), download, decrypt');
const { privateKey } = await unlockKeyBundle(await call('/keys'), PASSPHRASE);
const list = await call('/files');
const meta = await decryptMetadata(list[0], privateKey);
if (meta.name !== FILE_NAME) throw new Error('file name mismatch');
ok(`decrypted file name: ${meta.name}`);
const ciphertext = await call(`/files/${record.id}/blob`, { raw: true });
const decrypted = new TextDecoder().decode(await decryptFile(record, ciphertext, privateKey));
if (decrypted !== new TextDecoder().decode(plaintext)) throw new Error('content mismatch');
ok('decrypted content matches original');

console.log('6. Zero-knowledge check: search everything the server stored');
// Collects every stored item as raw bytes: files on disk (local mode), or every
// MongoDB document and GridFS chunk when MONGODB_URI is set.
async function storedItems() {
  if (process.env.MONGODB_URI) {
    const { createRequire } = await import('node:module');
    const require = createRequire(new URL('../server/package.json', import.meta.url));
    const { MongoClient } = require('mongodb');
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    const database = client.db(process.env.MONGODB_DB || 'sfs');
    const items = [];
    for (const { name } of await database.listCollections().toArray()) {
      for (const doc of await database.collection(name).find().toArray()) {
        const bytes = doc.data?.buffer ? Buffer.from(doc.data.buffer) : Buffer.from(JSON.stringify(doc));
        items.push({ label: `mongodb ${name}/${doc._id}`, bytes });
      }
    }
    await client.close();
    return items;
  }
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
  return walk(DATA_DIR).map((f) => ({ label: f, bytes: fs.readFileSync(f) }));
}
const stored = await storedItems();
for (const needle of [SECRET_TEXT, FILE_NAME, PASSPHRASE]) {
  const hit = stored.find((item) => item.bytes.includes(needle));
  if (hit) throw new Error(`FOUND "${needle}" in ${hit.label} - zero-knowledge violated!`);
}
ok(`scanned ${stored.length} stored items: no plaintext, no file name, no passphrase`);

console.log('7. Clean up');
await call(`/files/${record.id}`, { method: 'DELETE' });
ok('test file deleted');

console.log('\nAll checks passed.');
