# SFS — Secure File Storage with End-to-End Encryption

A cloud storage app where files are encrypted **in the browser** before upload.
The server (and AWS S3) only ever store ciphertext, so not even the server
operator can read your files (zero-knowledge design).

- **File encryption:** AES-256-GCM, a fresh random key per file
- **Key exchange:** each file key is encrypted with the user's RSA-OAEP 3072-bit public key (hybrid encryption)
- **Private key protection:** encrypted with a key derived from the user's vault passphrase (PBKDF2-SHA256, 600,000 rounds)
- **Login:** OAuth2 (GitHub) → server issues a JWT for API calls
- **Storage:** Backblaze B2 (or AWS S3 / any S3-compatible service, or MongoDB GridFS), or local disk for testing
- **Database:** MongoDB Atlas when deployed, a JSON file for local testing
- **Hosting:** Render (free), one service for the website and the API
- **Stack:** React + Vite (frontend), Node.js + Express (backend), Web Crypto API

## Project structure

```
secure-file-storage/
├── client/                      React frontend
│   ├── src/crypto/cryptoService.js   ← all encryption/decryption logic
│   ├── src/api/client.js             fetch wrapper (adds the JWT)
│   ├── src/pages/Login.jsx           OAuth / dev login
│   ├── src/pages/Vault.jsx           create or unlock the key pair
│   ├── src/pages/Files.jsx           upload, list, download, delete
│   ├── src/pages/Benchmark.jsx       encryption performance test
│   ├── src/components/ServerView.jsx shows what the server stores
│   └── tests/crypto.test.js          unit tests for the crypto module
├── server/                      Express backend
│   ├── src/index.js                  app entry
│   ├── src/routes/auth.js            OAuth2 (GitHub) + JWT issuing
│   ├── src/routes/keys.js            store/fetch the encrypted key bundle
│   ├── src/routes/files.js           upload/download encrypted blobs
│   ├── src/middleware/auth.js        JWT verification
│   ├── src/storage/                  local disk, MongoDB GridFS or S3 driver
│   └── src/db.js                     JSON file (local) or MongoDB (deployed)
├── scripts/zero-knowledge-check.mjs  end-to-end test + zero-knowledge check
├── docs/GUIDE.md                     how it works + presentation guide
├── docs/DEPLOY.md                    free deployment (Backblaze B2 + MongoDB Atlas + Render)
└── render.yaml                       Render deployment settings
```

## Running it

You need Node.js 18 or newer.

**1. Install**

```bash
cd server && npm install
cd ../client && npm install
```

**2. Configure** — copy `server/.env.example` to `server/.env` and set `JWT_SECRET`
to a long random string (already done if you received this project set up).
With the defaults, it uses dev login and local disk storage, so it runs with no
accounts or cloud setup.

**3. Start** (two terminals)

```bash
# terminal 1
cd server && npm run dev        # API on http://localhost:4000

# terminal 2
cd client && npm run dev        # app on http://localhost:5173
```

Open http://localhost:5173.

## Deploying online

See [docs/DEPLOY.md](docs/DEPLOY.md). Files go to Backblaze B2, the database to MongoDB Atlas,
and the app runs on Render. All three are free with no credit card.

## Turning on GitHub login (OAuth2)

1. Go to https://github.com/settings/developers → **New OAuth App**
2. Homepage URL: `http://localhost:5173`
   Authorization callback URL: `http://localhost:4000/api/auth/github/callback`
3. Copy the Client ID and generate a Client Secret into `server/.env`:
   ```
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   ```
4. Set `ALLOW_DEV_LOGIN=false` for the final demo, and restart the server.

## Turning on AWS S3

1. Create an S3 bucket (keep **Block all public access** on).
2. Create an IAM user with a policy that allows `s3:PutObject`, `s3:GetObject`,
   `s3:DeleteObject` on `arn:aws:s3:::YOUR-BUCKET/*`, and create an access key.
3. In `server/.env`:
   ```
   STORAGE_DRIVER=s3
   AWS_REGION=ap-south-1
   AWS_S3_BUCKET=your-bucket-name
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   ```
4. Restart the server. Uploaded objects appear under `users/<user-id>/` in the bucket.
   Download one from the S3 console — it is unreadable ciphertext.

## Testing

```bash
# Unit tests for the crypto module (9 tests)
cd client && npm test

# End-to-end + zero-knowledge check (server must be running with ALLOW_DEV_LOGIN=true)
node scripts/zero-knowledge-check.mjs

# Same check against a server that uses MongoDB
MONGODB_URI=mongodb://... node scripts/zero-knowledge-check.mjs
```

The in-app **Benchmark** tab measures encryption/decryption time for 1–50 MB
files and can export the results as CSV.

## Known limitations

- Forgetting the vault passphrase means the files are lost forever (by design: there is no server-side recovery).
- Files are encrypted in memory in one go, so very large files (hundreds of MB) are not supported; the limit is 50 MB by default.
- File sizes and upload times are visible to the server (only contents and names are hidden).
- Sharing files between users is not implemented (possible future work: wrap the file key with the other user's public key).
