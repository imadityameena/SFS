// Database layer with two interchangeable drivers:
//   json  – a small JSON file on local disk (development)
//   mongo – MongoDB, e.g. a free MongoDB Atlas cluster (deployment)
//
// Note what is stored: only public keys, *encrypted* private keys, *encrypted*
// AES keys and *encrypted* file names. Nothing here can be used to read a file.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

function jsonDb() {
  const DB_FILE = path.join(config.dataDir, 'db.json');
  fs.mkdirSync(config.dataDir, { recursive: true });

  let state = { users: {}, files: {} };
  if (fs.existsSync(DB_FILE)) {
    state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }

  function save() {
    // Write to a temp file then rename, so a crash can't leave half a file.
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }

  return {
    async getUser(id) {
      return state.users[id] || null;
    },
    async upsertUser(user) {
      state.users[user.id] = { ...state.users[user.id], ...user };
      save();
      return state.users[user.id];
    },
    async listFiles(ownerId) {
      return Object.values(state.files)
        .filter((f) => f.ownerId === ownerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getFile(id) {
      return state.files[id] || null;
    },
    async addFile(file) {
      state.files[file.id] = file;
      save();
      return file;
    },
    async deleteFile(id) {
      delete state.files[id];
      save();
    },
  };
}

async function mongoDb() {
  const { getMongoDb } = await import('./mongo.js');
  const database = await getMongoDb();
  const users = database.collection('users');
  const files = database.collection('files');
  await files.createIndex({ ownerId: 1, createdAt: -1 });

  // Our records use "id"; MongoDB uses "_id". Store both, return only "id".
  const clean = (doc) => {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest;
  };

  return {
    async getUser(id) {
      return clean(await users.findOne({ _id: id }));
    },
    async upsertUser(user) {
      const doc = await users.findOneAndUpdate(
        { _id: user.id },
        { $set: user },
        { upsert: true, returnDocument: 'after' },
      );
      return clean(doc);
    },
    async listFiles(ownerId) {
      const docs = await files.find({ ownerId }).sort({ createdAt: -1 }).toArray();
      return docs.map(clean);
    },
    async getFile(id) {
      return clean(await files.findOne({ _id: id }));
    },
    async addFile(file) {
      await files.insertOne({ _id: file.id, ...file });
      return file;
    },
    async deleteFile(id) {
      await files.deleteOne({ _id: id });
    },
  };
}

export const db = config.dbDriver === 'mongo' ? await mongoDb() : jsonDb();

console.log(`Database driver: ${config.dbDriver}`);
