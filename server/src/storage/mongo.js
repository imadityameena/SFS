// Stores encrypted blobs inside MongoDB using GridFS (splits each file into
// 255 KB chunks). Lets a free MongoDB Atlas cluster hold both the database
// and the encrypted files, so no separate storage account is needed.
import { GridFSBucket } from 'mongodb';
import { getMongoDb } from '../mongo.js';

export async function mongoStorage() {
  const bucket = new GridFSBucket(await getMongoDb(), { bucketName: 'blobs' });

  return {
    put(key, buffer) {
      return new Promise((resolve, reject) => {
        const upload = bucket.openUploadStream(key, { contentType: 'application/octet-stream' });
        upload.once('finish', resolve);
        upload.once('error', reject);
        upload.end(buffer);
      });
    },
    async get(key) {
      const chunks = [];
      for await (const chunk of bucket.openDownloadStreamByName(key)) chunks.push(chunk);
      return Buffer.concat(chunks);
    },
    async remove(key) {
      const found = await bucket.find({ filename: key }).toArray();
      for (const f of found) await bucket.delete(f._id);
    },
  };
}
