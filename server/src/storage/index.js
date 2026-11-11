// Storage layer. Both drivers expose the same three functions, so the rest
// of the server does not care where the encrypted blobs actually live.
import { config } from '../config.js';
import { localStorage } from './local.js';
import { s3Storage } from './s3.js';

export const storage = config.storageDriver === 's3' ? s3Storage() : localStorage();

console.log(`Storage driver: ${config.storageDriver}`);
