// Stores each user's RSA key pair. The private key arrives already
// encrypted (wrapped) by the browser with a key derived from the user's
// vault passphrase, so the server can store it but never use it.
import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const keysRouter = express.Router();
keysRouter.use(requireAuth);

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
function isB64(value, maxLen) {
  return typeof value === 'string' && value.length <= maxLen && BASE64.test(value);
}

keysRouter.get('/', (req, res) => {
  const user = db.getUser(req.userId);
  if (!user?.keys) return res.status(404).json({ error: 'No keys yet' });
  res.json(user.keys);
});

keysRouter.post('/', express.json({ limit: '64kb' }), (req, res) => {
  const user = db.getUser(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.keys) {
    // Replacing keys would make every existing file unreadable.
    return res.status(409).json({ error: 'Keys already exist for this user' });
  }

  const { publicKey, encryptedPrivateKey, salt, iv, iterations } = req.body || {};
  if (
    !isB64(publicKey, 4096) ||
    !isB64(encryptedPrivateKey, 8192) ||
    !isB64(salt, 64) ||
    !isB64(iv, 64) ||
    !Number.isInteger(iterations) ||
    iterations < 100000
  ) {
    return res.status(400).json({ error: 'Invalid key bundle' });
  }

  db.upsertUser({
    id: user.id,
    keys: { publicKey, encryptedPrivateKey, salt, iv, iterations },
  });
  res.status(201).json({ ok: true });
});
