// One shared MongoDB connection, used by the database and the GridFS file storage.
import { MongoClient } from 'mongodb';
import { config } from './config.js';

let dbPromise = null;

export function getMongoDb() {
  if (!dbPromise) {
    const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
    dbPromise = client.connect().then(() => {
      console.log('Connected to MongoDB');
      return client.db(config.mongoDbName);
    });
  }
  return dbPromise;
}
