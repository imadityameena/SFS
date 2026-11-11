import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { keysRouter } from './routes/keys.js';
import { filesRouter } from './routes/files.js';

const app = express();

app.use(cors({ origin: config.clientUrl }));
app.disable('x-powered-by');

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/keys', keysRouter);
app.use('/api/files', filesRouter);

// Central error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large (max ${config.maxFileBytes / 1024 / 1024} MB)` });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
