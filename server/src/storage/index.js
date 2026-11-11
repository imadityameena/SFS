// Storage layer. Every driver exposes the same three functions (put, get,
// remove), so the rest of the server does not care where the encrypted
// blobs actually live.
import { config } from '../config.js';

async function load(driver) {
  switch (driver) {
    case 's3':
      return (await import('./s3.js')).s3Storage();
    case 'mongo':
      return (await import('./mongo.js')).mongoStorage();
    case 'local':
      return (await import('./local.js')).localStorage();
    default:
      console.error(`Unknown STORAGE_DRIVER "${driver}". Use local, mongo or s3.`);
      process.exit(1);
  }
}

export const storage = await load(config.storageDriver);

console.log(`Storage driver: ${config.storageDriver}`);
