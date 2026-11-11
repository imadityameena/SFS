// A very small JSON-file database. Enough for a project demo; swap for
// MongoDB/PostgreSQL in production. Note what is stored here: only public
// keys, *encrypted* private keys, *encrypted* AES keys and *encrypted*
// file names. Nothing in this file can be used to read a user's files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

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

export const db = {
  // ----- users -----
  getUser(id) {
    return state.users[id] || null;
  },
  upsertUser(user) {
    state.users[user.id] = { ...state.users[user.id], ...user };
    save();
    return state.users[user.id];
  },

  // ----- files -----
  listFiles(ownerId) {
    return Object.values(state.files)
      .filter((f) => f.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  getFile(id) {
    return state.files[id] || null;
  },
  addFile(file) {
    state.files[file.id] = file;
    save();
    return file;
  },
  deleteFile(id) {
    delete state.files[id];
    save();
  },
};

export { DATA_DIR };
