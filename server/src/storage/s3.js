import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { config } from '../config.js';

// AWS credentials are read automatically from AWS_ACCESS_KEY_ID and
// AWS_SECRET_ACCESS_KEY in the environment.
export function s3Storage() {
  if (!config.s3.bucket) {
    console.error('STORAGE_DRIVER=s3 but AWS_S3_BUCKET is not set.');
    process.exit(1);
  }
  const client = new S3Client({ region: config.s3.region });
  const Bucket = config.s3.bucket;

  return {
    async put(key, buffer) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: buffer,
          ContentType: 'application/octet-stream', // it's ciphertext, always
        }),
      );
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return Buffer.from(await res.Body.transformToByteArray());
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}
