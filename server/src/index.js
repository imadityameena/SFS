import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { keysRouter } from './routes/keys.js';
import { filesRouter } from './routes/files.js';

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: config.clientUrl }));

// Security headers. The Content-Security-Policy only allows scripts from this
// site, which matters here: injected script could read decrypted keys.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  if (config.production) {
    res.set({
      'Strict-Transport-Security': 'max-age=31536000',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://avatars.githubusercontent.com",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    });
  }
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/keys', keysRouter);
app.use('/api/files', filesRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// In production, this same server also serves the built React app.
if (config.production && fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  console.log('Serving website from client/dist');
}

// Central error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large (max ${config.maxFileBytes / 1024 / 1024} MB)` });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Listening on port ${config.port}`);
});
