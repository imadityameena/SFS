// Run with:  npm test   (from the client folder)
// Uses Node's built-in test runner and Node's Web Crypto, which is the
// same API the browser uses, so this tests the real client code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKeyBundle,
  unlockKeyBundle,
  encryptFile,
  decryptFile,
  decryptMetadata,
  randomBytes,
} from '../src/crypto/cryptoService.js';

const PASS = 'correct horse battery staple';
const alice = await createKeyBundle(PASS);

test('file round-trip: decrypt(encrypt(x)) === x', async () => {
  const original = randomBytes(256 * 1024);
  const enc = await encryptFile(original, { name: 'a.bin', type: 'x' }, alice.publicKey);
  const dec = await decryptFile(enc, enc.blob, alice.privateKey);
  assert.deepEqual(new Uint8Array(dec), original);
});

test('ciphertext does not contain the plaintext', async () => {
  const text = new TextEncoder().encode('TOP SECRET exam answers '.repeat(50));
  const enc = await encryptFile(text, { name: 's.txt', type: 'text/plain' }, alice.publicKey);
  const asString = new TextDecoder('latin1').decode(enc.blob);
  assert.ok(!asString.includes('TOP SECRET'));
});

test('file name is encrypted and recoverable', async () => {
  const enc = await encryptFile(new Uint8Array([1]), { name: 'salary.pdf', type: 'application/pdf' }, alice.publicKey);
  assert.ok(!atob(enc.encryptedMeta).includes('salary'));
  assert.deepEqual(await decryptMetadata(enc, alice.privateKey), {
    name: 'salary.pdf',
    type: 'application/pdf',
  });
});

test('every upload uses a fresh key and IV', async () => {
  const data = new Uint8Array(100);
  const a = await encryptFile(data, { name: 'x', type: '' }, alice.publicKey);
  const b = await encryptFile(data, { name: 'x', type: '' }, alice.publicKey);
  assert.notEqual(a.wrappedKey, b.wrappedKey);
  assert.notEqual(a.iv, b.iv);
  assert.notDeepEqual(a.blob, b.blob);
});

test('tampered ciphertext is rejected (AES-GCM integrity)', async () => {
  const enc = await encryptFile(randomBytes(1024), { name: 'x', type: '' }, alice.publicKey);
  const tampered = enc.blob.slice();
  tampered[10] ^= 0xff; // flip bits in one byte
  await assert.rejects(decryptFile(enc, tampered, alice.privateKey), /Integrity check failed/);
});

test('key bundle unlocks with the right passphrase', async () => {
  const { privateKey } = await unlockKeyBundle(alice.bundle, PASS);
  const enc = await encryptFile(new Uint8Array([7, 7, 7]), { name: 'x', type: '' }, alice.publicKey);
  const dec = await decryptFile(enc, enc.blob, privateKey);
  assert.deepEqual(new Uint8Array(dec), new Uint8Array([7, 7, 7]));
});

test('key bundle does NOT unlock with a wrong passphrase', async () => {
  await assert.rejects(unlockKeyBundle(alice.bundle, 'wrong passphrase'), /Wrong passphrase/);
});

test("another user's private key cannot decrypt Alice's file", async () => {
  const bob = await createKeyBundle('bob-pass-123');
  const enc = await encryptFile(randomBytes(64), { name: 'x', type: '' }, alice.publicKey);
  await assert.rejects(decryptFile(enc, enc.blob, bob.privateKey));
});

test('unlocked private key is not extractable', async () => {
  assert.equal(alice.privateKey.extractable, false);
});
