// Upload / list / download / delete of ENCRYPTED files.
// Everything the server receives here is already encrypted by the browser:
//   blob          -> file bytes encrypted with AES-256-GCM
//   wrappedKey    -> the AES key, encrypted with the user's RSA public key
//   encryptedMeta -> file name + type, encrypted with the same AES key
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { db } from '../db.js';
import { storage } from '../storage/index.js';
import { requireAuth } from '../middleware/auth.js';

export const filesRouter = express.Router();
filesRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes, files: 1 },
});

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
function isB64(value, maxLen) {
  return typeof value === 'string' && value.length <= maxLen && BASE64.test(value);
}

// Only the owner may touch a file.
async function findOwnFile(req, res) {
  const file = await db.getFile(req.params.id);
  if (!file || file.ownerId !== req.userId) {
    res.status(404).json({ error: 'File not found' });
    return null;
  }
  return file;
}

function publicView(file) {
  const { storageKey, ownerId, ...rest } = file;
  return rest;
}

filesRouter.get('/', async (req, res, next) => {
  try {
    res.json((await db.listFiles(req.userId)).map(publicView));
  } catch (err) {
    next(err);
  }
});

filesRouter.post('/', upload.single('blob'), async (req, res, next) => {
  try {
    const { wrappedKey, iv, encryptedMeta, metaIv } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Missing encrypted blob' });
    if (
      !isB64(wrappedKey, 2048) ||
      !isB64(iv, 32) ||
      !isB64(encryptedMeta, 4096) ||
      !isB64(metaIv, 32)
    ) {
      return res.status(400).json({ error: 'Invalid encryption fields' });
    }

    const id = crypto.randomUUID();
    // Server-generated object key, e.g. users/github_123/<uuid>.bin
    const storageKey = `users/${req.userId.replace(/[^a-zA-Z0-9]/g, '_')}/${id}.bin`;
    await storage.put(storageKey, req.file.buffer);

    const record = await db.addFile({
      id,
      ownerId: req.userId,
      storageKey,
      size: req.file.size, // ciphertext size (plaintext + 16-byte GCM tag)
      wrappedKey,
      iv,
      encryptedMeta,
      metaIv,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(publicView(record));
  } catch (err) {
    next(err);
  }
});

// Returns the raw ciphertext. The browser decrypts it.
filesRouter.get('/:id/blob', async (req, res, next) => {
  try {
    const file = await findOwnFile(req, res);
    if (!file) return;
    const buffer = await storage.get(file.storageKey);
    res.set('Content-Type', 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

filesRouter.delete('/:id', async (req, res, next) => {
  try {
    const file = await findOwnFile(req, res);
    if (!file) return;
    await storage.remove(file.storageKey);
    await db.deleteFile(file.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
