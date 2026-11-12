import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectVersionsCommand,
} from '@aws-sdk/client-s3';
import { config } from '../config.js';

// AWS credentials are read automatically from AWS_ACCESS_KEY_ID and
// AWS_SECRET_ACCESS_KEY in the environment.
export function s3Storage() {
  if (!config.s3.bucket) {
    console.error('STORAGE_DRIVER=s3 but AWS_S3_BUCKET is not set.');
    process.exit(1);
  }
  const client = new S3Client({
    region: config.s3.region,
    // For S3-compatible services (Backblaze B2, Cloudflare R2, MinIO). Newer SDK
    // versions add extra checksum headers by default, which some of these
    // services reject, so only send them when an operation requires it.
    ...(config.s3.endpoint && {
      endpoint: config.s3.endpoint,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
  });
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
      // Backblaze B2 (and versioned S3 buckets) only hide a deleted object and
      // keep the old copy. Remove every stored version so delete is final.
      try {
        const res = await client.send(new ListObjectVersionsCommand({ Bucket, Prefix: key }));
        const versions = [...(res.Versions || []), ...(res.DeleteMarkers || [])]
          .filter((v) => v.Key === key && v.VersionId && v.VersionId !== 'null');
        for (const v of versions) {
          await client.send(new DeleteObjectCommand({ Bucket, Key: key, VersionId: v.VersionId }));
        }
      } catch (err) {
        console.warn(`Could not remove old versions of ${key}: ${err.name}`);
      }
    },
  };
}
