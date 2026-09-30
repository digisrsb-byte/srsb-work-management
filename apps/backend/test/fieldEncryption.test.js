// Uses generated keys and fictional identifiers only; touches no database or upload folder.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';
import {
  DecryptionError,
  EncryptionConfigError,
  blindIndex,
  decryptField,
  decryptFile,
  encryptField,
  encryptFile,
  fieldKeyId,
  isEncryptedField,
  isEncryptedFile,
  lastFour,
  loadKeyring,
  needsReencryption
} from '../src/services/fieldEncryption.js';

const newKey = () => crypto.randomBytes(32).toString('base64');
const K1 = newKey();
const K2 = newKey();
const BLIND = newKey();

function keyringFor(keys, activeKeyId, blind = BLIND) {
  return loadKeyring({
    FIELD_ENCRYPTION_KEYS: JSON.stringify(keys),
    FIELD_ENCRYPTION_ACTIVE_KEY_ID: activeKeyId,
    BLIND_INDEX_KEY: blind
  });
}

const keyring = keyringFor({ k1: K1 }, 'k1');
const FAKE_ACCOUNT = '000011112222';
const FAKE_AADHAAR = '9999 8888 7777';
const FAKE_PAN = 'ZZZZZ9999Z';
const ctx = (column, id = 1) => `employee_bank_details.${column}:${id}`;

describe('field encryption', () => {
  test('round-trips fake identifiers', () => {
    for (const value of [FAKE_ACCOUNT, FAKE_AADHAAR, FAKE_PAN, 'ünïcødé-värde']) {
      const payload = encryptField(value, { context: ctx('account_number'), keyring });
      assert.ok(isEncryptedField(payload));
      assert.ok(!payload.includes(value), 'ciphertext must not contain the plaintext');
      assert.equal(decryptField(payload, { context: ctx('account_number'), keyring }), value);
    }
  });

  test('uses a fresh IV so equal values encrypt differently', () => {
    const a = encryptField(FAKE_ACCOUNT, { context: ctx('account_number'), keyring });
    const b = encryptField(FAKE_ACCOUNT, { context: ctx('account_number'), keyring });
    assert.notEqual(a, b);
  });

  test('passes null and empty values through', () => {
    assert.equal(encryptField(null, { context: ctx('pan_number'), keyring }), null);
    assert.equal(encryptField('', { context: ctx('pan_number'), keyring }), null);
    assert.equal(decryptField(null, { context: ctx('pan_number'), keyring }), null);
  });

  test('requires an encryption context', () => {
    assert.throws(() => encryptField(FAKE_ACCOUNT, { keyring }), TypeError);
    assert.throws(() => encryptField(FAKE_ACCOUNT, { context: ' ', keyring }), TypeError);
  });

  test('detects tampering with ciphertext, tag or IV', () => {
    const payload = encryptField(FAKE_ACCOUNT, { context: ctx('account_number'), keyring });
    const parts = payload.split(':');
    const flip = (text) => {
      const bytes = Buffer.from(text, 'base64url');
      bytes[0] ^= 0x01;
      return bytes.toString('base64url');
    };
    for (const index of [2, 3, 4]) {
      const tampered = [...parts];
      tampered[index] = flip(tampered[index]);
      assert.throws(() => decryptField(tampered.join(':'), { context: ctx('account_number'), keyring }), DecryptionError);
    }
  });

  test('rejects a value moved to another row or column', () => {
    const payload = encryptField(FAKE_ACCOUNT, { context: ctx('account_number', 1), keyring });
    assert.throws(() => decryptField(payload, { context: ctx('account_number', 2), keyring }), DecryptionError);
    assert.throws(() => decryptField(payload, { context: ctx('pan_number', 1), keyring }), DecryptionError);
  });

  test('rejects the wrong key, unknown key ids and malformed values', () => {
    const payload = encryptField(FAKE_ACCOUNT, { context: ctx('account_number'), keyring });
    const otherKeyring = keyringFor({ k1: K2 }, 'k1');
    assert.throws(() => decryptField(payload, { context: ctx('account_number'), keyring: otherKeyring }), DecryptionError);
    const unknownId = keyringFor({ k9: K1 }, 'k9');
    assert.throws(() => decryptField(payload, { context: ctx('account_number'), keyring: unknownId }), DecryptionError);
    assert.throws(() => decryptField(FAKE_ACCOUNT, { context: ctx('account_number'), keyring }), DecryptionError);
  });

  test('supports key rotation', () => {
    const oldPayload = encryptField(FAKE_ACCOUNT, { context: ctx('account_number'), keyring });
    const rotated = keyringFor({ k1: K1, k2: K2 }, 'k2');
    assert.equal(decryptField(oldPayload, { context: ctx('account_number'), keyring: rotated }), FAKE_ACCOUNT);
    assert.ok(needsReencryption(oldPayload, rotated));
    const newPayload = encryptField(FAKE_ACCOUNT, { context: ctx('account_number'), keyring: rotated });
    assert.equal(fieldKeyId(newPayload), 'k2');
    assert.ok(!needsReencryption(newPayload, rotated));
  });

  test('error messages never include plaintext or ciphertext', () => {
    const payload = encryptField(FAKE_ACCOUNT, { context: ctx('account_number'), keyring });
    try {
      decryptField(payload, { context: ctx('account_number', 99), keyring });
      assert.fail('expected a DecryptionError');
    } catch (error) {
      const text = `${error.message} ${error.stack}`;
      assert.ok(!text.includes(FAKE_ACCOUNT));
      assert.ok(!text.includes(payload.split(':')[4]));
    }
  });
});

describe('keyring configuration', () => {
  const base = { FIELD_ENCRYPTION_KEYS: JSON.stringify({ k1: K1 }), FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'k1', BLIND_INDEX_KEY: BLIND };

  test('rejects missing or invalid settings', () => {
    const cases = [
      { ...base, FIELD_ENCRYPTION_KEYS: '' },
      { ...base, FIELD_ENCRYPTION_KEYS: 'not json' },
      { ...base, FIELD_ENCRYPTION_KEYS: JSON.stringify([K1]) },
      { ...base, FIELD_ENCRYPTION_KEYS: JSON.stringify({ k1: crypto.randomBytes(16).toString('base64') }) },
      { ...base, FIELD_ENCRYPTION_KEYS: JSON.stringify({ 'bad id!': K1 }) },
      { ...base, FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'k2' },
      { ...base, BLIND_INDEX_KEY: '' },
      { ...base, BLIND_INDEX_KEY: K1 }
    ];
    for (const env of cases) assert.throws(() => loadKeyring(env), EncryptionConfigError);
  });

  test('never reveals key material when logged or serialised', () => {
    const inspected = util.inspect(keyring, { depth: 5, showHidden: true });
    const json = JSON.stringify(keyring);
    for (const secret of [K1, BLIND]) {
      assert.ok(!inspected.includes(secret));
      assert.ok(!json.includes(secret));
    }
    assert.match(inspected, /activeKeyId: 'k1'/);
  });

  test('config errors do not echo the key value', () => {
    const shortKey = crypto.randomBytes(16).toString('base64');
    try {
      loadKeyring({ ...base, FIELD_ENCRYPTION_KEYS: JSON.stringify({ k1: shortKey }) });
      assert.fail('expected EncryptionConfigError');
    } catch (error) {
      assert.ok(!error.message.includes(shortKey));
    }
  });
});

describe('blind index and masking helpers', () => {
  test('is deterministic and normalises spacing and case', () => {
    const a = blindIndex('9999 8888 7777', { purpose: 'aadhaar', keyring });
    assert.equal(a, blindIndex('999988887777', { purpose: 'aadhaar', keyring }));
    assert.equal(blindIndex('zzzzz9999z', { purpose: 'pan', keyring }), blindIndex('ZZZZZ9999Z', { purpose: 'pan', keyring }));
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.ok(!a.includes('7777'));
  });

  test('separates purposes and keys', () => {
    const value = FAKE_ACCOUNT;
    assert.notEqual(blindIndex(value, { purpose: 'bank_account', keyring }), blindIndex(value, { purpose: 'aadhaar', keyring }));
    const other = keyringFor({ k1: K1 }, 'k1', newKey());
    assert.notEqual(blindIndex(value, { purpose: 'bank_account', keyring }), blindIndex(value, { purpose: 'bank_account', keyring: other }));
  });

  test('requires a purpose and skips empty values', () => {
    assert.throws(() => blindIndex(FAKE_ACCOUNT, { keyring }), TypeError);
    assert.equal(blindIndex('', { purpose: 'pan', keyring }), null);
  });

  test('lastFour returns only the final four characters', () => {
    assert.equal(lastFour(FAKE_ACCOUNT), '2222');
    assert.equal(lastFour(FAKE_AADHAAR), '7777');
    assert.equal(lastFour('zzzzz9999z'), '999Z');
    assert.equal(lastFour('1234'), null, 'too short to mask safely');
    assert.equal(lastFour(null), null);
  });
});

describe('file encryption', () => {
  const fakePdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), crypto.randomBytes(4096), Buffer.from('FAKE AADHAAR 9999 8888 7777')]);
  const fileCtx = 'document_versions:1700000000000-abcd1234.enc';

  test('round-trips fake file bytes through a temp folder', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srsb-enc-test-'));
    try {
      const target = path.join(dir, 'sample.enc');
      fs.writeFileSync(target, encryptFile(fakePdf, { context: fileCtx, keyring }));
      const stored = fs.readFileSync(target);
      assert.ok(isEncryptedFile(stored));
      assert.ok(!stored.includes(Buffer.from('%PDF')), 'plain file header must not be visible');
      assert.ok(!stored.includes(Buffer.from('9999 8888 7777')), 'plain content must not be visible');
      assert.ok(decryptFile(stored, { context: fileCtx, keyring }).equals(fakePdf));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('detects tampering, wrong context, wrong key and plain files', () => {
    const encrypted = encryptFile(fakePdf, { context: fileCtx, keyring });
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0x01;
    assert.throws(() => decryptFile(tampered, { context: fileCtx, keyring }), DecryptionError);
    assert.throws(() => decryptFile(encrypted, { context: 'document_versions:other.enc', keyring }), DecryptionError);
    assert.throws(() => decryptFile(encrypted, { context: fileCtx, keyring: keyringFor({ k1: K2 }, 'k1') }), DecryptionError);
    assert.throws(() => decryptFile(fakePdf, { context: fileCtx, keyring }), DecryptionError);
    assert.throws(() => decryptFile(encrypted.subarray(0, 20), { context: fileCtx, keyring }), DecryptionError);
  });

  test('file keys are separate from field keys', () => {
    const payload = encryptField('same-bytes', { context: fileCtx, keyring });
    const file = encryptFile(Buffer.from('same-bytes'), { context: fileCtx, keyring });
    const iv = file.subarray(11, 23);
    const tag = file.subarray(23, 39);
    const forged = ['v1', 'k1', iv.toString('base64url'), tag.toString('base64url'), file.subarray(39).toString('base64url')].join(':');
    assert.throws(() => decryptField(forged, { context: fileCtx, keyring }), DecryptionError);
    assert.equal(decryptField(payload, { context: fileCtx, keyring }), 'same-bytes');
  });
});
