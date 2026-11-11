// =====================================================================
//  Client-side cryptography (Web Crypto API)
// =====================================================================
//  Everything in this file runs in the user's browser. The server only
//  ever receives the OUTPUTS of these functions, which are encrypted.
//
//  Algorithms used:
//   - AES-256-GCM  : encrypts file contents (fast, and detects tampering)
//   - RSA-OAEP 3072 with SHA-256 : encrypts ("wraps") each file's AES key
//   - PBKDF2-SHA256 (600,000 rounds) : turns the user's vault passphrase
//     into an AES key that protects the RSA private key
//
//  Hybrid encryption in one picture:
//
//     file ──AES-256-GCM(fileKey)──▶ ciphertext            (stored in S3)
//     fileKey ──RSA-OAEP(publicKey)──▶ wrappedKey          (stored in DB)
//     privateKey ──AES-GCM(PBKDF2(passphrase))──▶ encryptedPrivateKey (DB)
//
//  Only someone who knows the passphrase can recover the private key,
//  and only the private key can recover a file key.
// =====================================================================

const subtle = globalThis.crypto.subtle;

export const RSA_PARAMS = {
  name: 'RSA-OAEP',
  modulusLength: 3072,
  publicExponent: new Uint8Array([1, 0, 1]), // 65537
  hash: 'SHA-256',
};
export const PBKDF2_ITERATIONS = 600_000;
const AES_KEY_BITS = 256;
const IV_BYTES = 12; // 96-bit IV, the recommended size for GCM

// ---------- small helpers ----------

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Process in chunks so large buffers don't overflow the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// getRandomValues can only fill 65,536 bytes per call, so fill in chunks.
export function randomBytes(n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) {
    globalThis.crypto.getRandomValues(out.subarray(i, Math.min(i + 65536, n)));
  }
  return out;
}

// ---------- user key pair (done once, at vault setup) ----------

// Derives an AES key from the passphrase. Same passphrase + same salt
// always gives the same key, so we can unlock again later.
async function deriveKeyFromPassphrase(passphrase, salt, iterations) {
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Creates a new RSA key pair and protects the private key with the
 * passphrase. Returns the bundle to send to the server, plus the live keys.
 */
export async function createKeyBundle(passphrase) {
  const keyPair = await subtle.generateKey(RSA_PARAMS, true, ['encrypt', 'decrypt']);

  const publicKeyDer = await subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyDer = await subtle.exportKey('pkcs8', keyPair.privateKey);

  const salt = randomBytes(16);
  const iv = randomBytes(IV_BYTES);
  const passKey = await deriveKeyFromPassphrase(passphrase, salt, PBKDF2_ITERATIONS);
  const encryptedPrivateKey = await subtle.encrypt({ name: 'AES-GCM', iv }, passKey, privateKeyDer);

  return {
    bundle: {
      publicKey: toBase64(publicKeyDer),
      encryptedPrivateKey: toBase64(encryptedPrivateKey),
      salt: toBase64(salt),
      iv: toBase64(iv),
      iterations: PBKDF2_ITERATIONS,
    },
    publicKey: keyPair.publicKey,
    privateKey: await importPrivateKey(privateKeyDer),
  };
}

/**
 * Recovers the private key from the server's bundle using the passphrase.
 * A wrong passphrase makes AES-GCM decryption fail, so we throw.
 */
export async function unlockKeyBundle(bundle, passphrase) {
  const passKey = await deriveKeyFromPassphrase(
    passphrase,
    fromBase64(bundle.salt),
    bundle.iterations,
  );
  let privateKeyDer;
  try {
    privateKeyDer = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(bundle.iv) },
      passKey,
      fromBase64(bundle.encryptedPrivateKey),
    );
  } catch {
    throw new Error('Wrong passphrase');
  }
  return {
    privateKey: await importPrivateKey(privateKeyDer),
    publicKey: await subtle.importKey('spki', fromBase64(bundle.publicKey), RSA_PARAMS, true, [
      'encrypt',
    ]),
  };
}

// Re-import as NON-extractable: once unlocked, page scripts can use the
// key but cannot export its raw bytes.
function importPrivateKey(der) {
  return subtle.importKey('pkcs8', der, RSA_PARAMS, false, ['decrypt']);
}

// ---------- per-file encryption ----------

async function aesEncrypt(key, data) {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

/**
 * Encrypts one file for upload.
 * @param {ArrayBuffer} fileBytes  the plaintext file contents
 * @param {{name: string, type: string}} meta  file name and MIME type
 * @param {CryptoKey} publicKey  the owner's RSA public key
 */
export async function encryptFile(fileBytes, meta, publicKey) {
  // 1. Fresh random AES-256 key for this file only.
  const fileKey = await subtle.generateKey({ name: 'AES-GCM', length: AES_KEY_BITS }, true, [
    'encrypt',
    'decrypt',
  ]);

  // 2. Encrypt the contents, and separately the file name/type.
  const content = await aesEncrypt(fileKey, fileBytes);
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const encMeta = await aesEncrypt(fileKey, metaBytes);

  // 3. Wrap the AES key with RSA-OAEP so only the private key can open it.
  const rawFileKey = await subtle.exportKey('raw', fileKey);
  const wrappedKey = await subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawFileKey);

  return {
    blob: content.ciphertext, // goes to S3
    iv: toBase64(content.iv),
    wrappedKey: toBase64(wrappedKey),
    encryptedMeta: toBase64(encMeta.ciphertext),
    metaIv: toBase64(encMeta.iv),
  };
}

// Recovers a file's AES key using the private key.
async function unwrapFileKey(wrappedKeyB64, privateKey) {
  const raw = await subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, fromBase64(wrappedKeyB64));
  return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
}

/** Decrypts the file name and type (used to show the file list). */
export async function decryptMetadata(record, privateKey) {
  const fileKey = await unwrapFileKey(record.wrappedKey, privateKey);
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(record.metaIv) },
    fileKey,
    fromBase64(record.encryptedMeta),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

/**
 * Decrypts downloaded ciphertext. Throws if the data was modified in any
 * way, because AES-GCM checks an authentication tag.
 */
export async function decryptFile(record, ciphertext, privateKey) {
  const fileKey = await unwrapFileKey(record.wrappedKey, privateKey);
  try {
    return await subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(record.iv) }, fileKey, ciphertext);
  } catch {
    throw new Error('Integrity check failed: the file was modified or corrupted');
  }
}
