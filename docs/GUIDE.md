# Project Guide — understanding, demoing and defending CipherVault

This guide is for you, the presenter. Read it once fully, then use sections
4–6 when preparing slides and the viva.

---

## 1. The idea in one paragraph

Normal cloud storage (Google Drive, Dropbox) encrypts your files, but *they*
hold the keys, so they can read your files. In this project, the browser
encrypts the file **before** upload, and the key needed to decrypt it is
locked with a passphrase that the server never sees. So the server stores
data it cannot read. This is called **zero-knowledge** or **end-to-end
encrypted** storage.

## 2. The three keys (most important thing to understand)

| Key | Type | Where it comes from | How it is protected | Where it is stored |
|---|---|---|---|---|
| **File key** | AES-256 (symmetric) | Random, new for every file | Encrypted with the user's RSA **public key** → `wrappedKey` | Server DB (encrypted) |
| **RSA key pair** | RSA-OAEP 3072 (asymmetric) | Generated once in the browser at vault setup | Private key encrypted with the **passphrase key** | Public key: DB (plain). Private key: DB (encrypted) |
| **Passphrase key** | AES-256 (symmetric) | Derived from the passphrase with PBKDF2 | Never stored anywhere — recomputed when you type the passphrase | Nowhere |

Chain: **passphrase → unlocks private key → unlocks file key → unlocks file.**

### Why hybrid (AES + RSA) instead of only one?

- **RSA alone:** too slow, and RSA-OAEP 3072 can only encrypt ~318 bytes at a time. You cannot encrypt a 10 MB file with it directly.
- **AES alone:** fast, but then where do you keep the AES key? Wrapping it with RSA means the server can store it safely, and later it could be wrapped for another user's public key to share a file.
- **Hybrid:** AES does the heavy work (fast), RSA protects the small AES key. This is the same pattern TLS, PGP and Signal use.

### Why AES-**GCM**?

GCM is *authenticated* encryption. Besides hiding the data, it adds a 16-byte
tag. If anyone changes even one bit of the stored file, decryption fails
instead of returning garbage. (Shown by the unit test "tampered ciphertext is
rejected".) That's why encrypted size = original size + 16 bytes.

### Why PBKDF2 with 600,000 iterations?

Passphrases are weak compared to random keys. PBKDF2 runs SHA-256 600,000
times, so each guess costs an attacker real time. 600,000 is the current OWASP
recommendation for PBKDF2-SHA256. The random **salt** means two users with the
same passphrase still get different keys.

### Why RSA-3072 and not 2048?

NIST SP 800-57 rates RSA-3072 as ~128-bit security (recommended beyond 2030);
2048 is ~112-bit. The cost is only slower key generation, done once.

### Why not ECC?

The proposal says "RSA/ECC". RSA-OAEP was chosen because Web Crypto supports
encrypting a key with it directly. ECC (ECDH) would need an extra key-agreement
step. Mention ECC as an alternative with smaller keys if asked.

## 3. The flows, mapped to code

### Login (OAuth2 + JWT) — [server/src/routes/auth.js](../server/src/routes/auth.js)

1. "Sign in with GitHub" → `GET /api/auth/github` → redirect to GitHub with a random `state` value (protects against CSRF).
2. GitHub sends the user back to `/api/auth/github/callback?code=…&state=…`.
3. Server checks `state`, then exchanges `code` + client secret for an access token (server-to-server).
4. Server reads the GitHub profile, creates the user, and signs a **JWT** (HS256, 1 hour).
5. Redirects to the app with `#token=…` (the `#` part is never sent to servers, so the token stays out of logs).
6. Every later API call sends `Authorization: Bearer <JWT>`; [middleware/auth.js](../server/src/middleware/auth.js) verifies it. That's "stateless sessions" — the server keeps no session table.

> Important point for the viva: **OAuth/JWT protect *access*, encryption protects *content*.** Even if someone steals a JWT, they only get ciphertext.

### Vault setup / unlock — [client/src/pages/Vault.jsx](../client/src/pages/Vault.jsx)

- First time: `createKeyBundle(passphrase)` generates the RSA pair, encrypts the private key, and sends `{publicKey, encryptedPrivateKey, salt, iv, iterations}` to `POST /api/keys`.
- Later: `GET /api/keys` → `unlockKeyBundle(bundle, passphrase)`. Wrong passphrase → AES-GCM fails → "Wrong passphrase".
- The unlocked private key is held only in memory as a **non-extractable** `CryptoKey`. "Lock" or closing the tab forgets it.

### Upload — `encryptFile()` in [cryptoService.js](../client/src/crypto/cryptoService.js)

1. Generate a random AES-256 file key.
2. Encrypt file contents with AES-GCM (random 12-byte IV).
3. Encrypt the file name + type with the same key (different IV).
4. Encrypt the file key with the RSA public key → `wrappedKey`.
5. Send `blob` + `wrappedKey` + `iv` + `encryptedMeta` + `metaIv` to `POST /api/files`.
6. Server puts the blob in S3/disk and the other fields in the DB.

### Download — `decryptFile()`

1. `GET /api/files/:id/blob` → ciphertext.
2. RSA-decrypt `wrappedKey` with the private key → file key.
3. AES-GCM decrypt → original bytes → browser saves the file.

## 4. Demo script (about 7 minutes)

Prepare beforehand: server and client running, one browser window, a small
text file `secret.txt` containing something recognisable, and a PDF/image.

1. **Login** — click "Sign in with GitHub", approve. (Explain OAuth2 in one sentence.)
2. **Create vault** — set a passphrase. Point out the warning: the server never sees it.
3. **Upload** `secret.txt` and the image. Point at the status line showing encryption time.
4. **Server view** — click it on `secret.txt`. Show: the name is gibberish, the key is wrapped, the bytes are random hex. "This is everything the server has."
5. **Show storage directly** — open the S3 console (or `server/data/blobs/`) and download the object. Open it in a text editor: unreadable.
6. **Show the DB** — open `server/data/db.json`: no file names, only base64 ciphertext.
7. **Download** the file in the app — it opens normally.
8. **Lock** then unlock with a **wrong** passphrase → error. Unlock with the right one → works.
9. **Benchmark** tab → Run → explain the numbers (see section 5).
10. **Terminal**: run `npm test` (9 passing) and `node scripts/zero-knowledge-check.mjs` (all checks passed).

## 5. Evaluation (Phase 5) — what to put in the report

**Correctness** — the 9 unit tests in [client/tests/crypto.test.js](../client/tests/crypto.test.js):
round-trip, ciphertext doesn't contain plaintext, encrypted file names, fresh
key/IV per upload, tamper detection, right/wrong passphrase, another user's key
can't decrypt, private key not extractable.

**Zero-knowledge** — [scripts/zero-knowledge-check.mjs](../scripts/zero-knowledge-check.mjs)
uploads a file with a known secret string, then searches every byte the server
stored for the secret, the file name and the passphrase. None are found.

**Performance** — run the Benchmark tab on your laptop and **use your own
numbers** in the report (export CSV, make a chart in Excel/Sheets). What to say:
AES-GCM in Web Crypto is hardware-accelerated (AES-NI), so it typically runs at
hundreds of MB/s; time grows linearly with file size; RSA wrapping is a fixed
cost of a few milliseconds per file regardless of size; compared to network
upload time, the encryption overhead is small. Also mention the one-time cost
of PBKDF2 when unlocking (~0.3–1 s), which is deliberate.

## 6. Likely viva questions

**Q: If the server is hacked, what does the attacker get?**
Ciphertext blobs, wrapped file keys, encrypted private keys, public keys, sizes
and dates. To read anything they'd have to brute-force each user's passphrase
through 600,000 PBKDF2 rounds.

**Q: Where is the private key stored?**
On the server, but encrypted with a passphrase-derived key. Decrypted only in
the browser's memory.

**Q: What happens if the user forgets the passphrase?**
The files are lost. That's the trade-off of zero-knowledge — nobody, including
the operator, can recover them. A real product would offer a recovery key printed at signup.

**Q: Why not just use HTTPS?**
HTTPS protects data in transit only. The server still receives plaintext. Here
the server never receives plaintext at all. (In production you'd use HTTPS *as well*.)

**Q: Why does each file get its own AES key?**
If one key leaked, only one file would be exposed. It also allows sharing a
single file later without exposing others.

**Q: Why is the IV random and stored in the clear?**
The IV doesn't need to be secret, only unique per key. Reusing an IV with the
same GCM key is catastrophic, so we generate a fresh random one each time.

**Q: What is the difference between OAuth2 and JWT here?**
OAuth2 proves who the user is (via GitHub). JWT is our own signed token that
the client presents on each API call so the server doesn't need sessions.

**Q: Can a malicious server attack this?**
It cannot read stored data. Its main remaining power is that it serves the
JavaScript, so a compromised server could serve modified code. This is a known
limitation of all browser-based E2EE apps (mitigations: browser extensions,
subresource integrity, native apps). Good to mention as an honest limitation.

**Q: What does the server still learn (metadata)?**
Who uploaded, how many files, their sizes and upload times. Not names or contents.

**Q: Why is JWT in sessionStorage and not a cookie?**
Simpler for this project and avoids CSRF on API calls. The trade-off is XSS
exposure; a production app might use an httpOnly cookie. Either way, the JWT
alone cannot decrypt anything.

## 7. Future work (for your conclusion slide)

- Secure file sharing between users (wrap the file key with the recipient's public key)
- Chunked/streaming encryption for very large files
- Passphrase recovery key
- Google login as a second OAuth provider
- Deployment with HTTPS and a real database
