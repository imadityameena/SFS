import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name} (see server/.env.example)`);
    process.exit(1);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',

  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl:
      process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/api/auth/github/callback',
  },
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === 'true',

  storageDriver: process.env.STORAGE_DRIVER || 'local',
  s3: {
    region: process.env.AWS_REGION || 'ap-south-1',
    bucket: process.env.AWS_S3_BUCKET || '',
  },

  maxFileBytes: Number(process.env.MAX_FILE_MB || 50) * 1024 * 1024,
};

export const githubEnabled = Boolean(config.github.clientId && config.github.clientSecret);
