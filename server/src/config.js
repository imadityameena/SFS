import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name} (see server/.env.example)`);
    process.exit(1);
  }
  return value;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// On Render, RENDER_EXTERNAL_URL is set automatically (e.g. https://sfs-abcd.onrender.com).
// In production the API and the website share this one address.
const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '';

export const config = {
  port: Number(process.env.PORT || 4000),
  production: process.env.NODE_ENV === 'production',
  clientUrl: process.env.CLIENT_URL || publicUrl || 'http://localhost:5173',

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',

  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl:
      process.env.GITHUB_CALLBACK_URL ||
      `${publicUrl || 'http://localhost:4000'}/api/auth/github/callback`,
  },
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === 'true',

  // "json" = a JSON file on local disk (development)
  // "mongo" = MongoDB, e.g. a free MongoDB Atlas cluster (deployment)
  dbDriver: process.env.DB_DRIVER || 'json',
  mongoUri: process.env.MONGODB_URI || '',
  mongoDbName: process.env.MONGODB_DB || 'sfs',

  // "local" = server/data/blobs, "mongo" = MongoDB GridFS, "s3" = AWS S3 or any S3-compatible service
  storageDriver: process.env.STORAGE_DRIVER || 'local',
  s3: {
    region: process.env.AWS_REGION || 'ap-south-1',
    bucket: process.env.AWS_S3_BUCKET || '',
    // Optional: set for S3-compatible services such as Backblaze B2 or Cloudflare R2.
    endpoint: process.env.S3_ENDPOINT || '',
  },

  maxFileBytes: Number(process.env.MAX_FILE_MB || 50) * 1024 * 1024,

  dataDir: path.join(__dirname, '..', 'data'),
  clientDist: path.join(__dirname, '..', '..', 'client', 'dist'),
};

if ((config.dbDriver === 'mongo' || config.storageDriver === 'mongo') && !config.mongoUri) {
  console.error('DB_DRIVER or STORAGE_DRIVER is "mongo" but MONGODB_URI is not set.');
  process.exit(1);
}

export const githubEnabled = Boolean(config.github.clientId && config.github.clientSecret);
