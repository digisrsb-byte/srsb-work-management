import crypto from 'crypto';
import util from 'util';

/*
 * Authenticated encryption (AES-256-GCM) for sensitive fields and uploaded files.
 *
 * Keys come from the environment only:
 *   FIELD_ENCRYPTION_KEYS          JSON object of keyId -> base64 32-byte master key
 *   FIELD_ENCRYPTION_ACTIVE_KEY_ID keyId used for new encryptions (older ids stay decryptable)
 *   BLIND_INDEX_KEY                base64 32-byte key for searchable HMAC indexes
 *
 * Field and file keys are derived from each master key with HKDF so the two uses never share
 * a key. Every ciphertext is bound to a caller-supplied context (e.g. table.column:rowId) as
 * additional authenticated data, so a value copied onto another row or column fails to decrypt.
 *
 * Error messages never contain plaintext, ciphertext or key material.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FIELD_VERSION = 'v1';
const FIELD_PATTERN = /^v1:([A-Za-z0-9_-]{1,32}):([A-Za-z0-9_-]{16}):([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]*)$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const FILE_MAGIC = Buffer.from('SRSBENC1', 'ascii');

export class EncryptionConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EncryptionConfigError';
  }
}

export class DecryptionError extends Error {
  constructor(message = 'Encrypted value could not be decrypted.') {
    super(message);
    this.name = 'DecryptionError';
  }
}

function decodeKey(name, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new EncryptionConfigError(`${name} is not configured.`);
  }
  const key = Buffer.from(value.trim(), 'base64');
  if (key.length !== KEY_BYTES) {
    throw new EncryptionConfigError(`${name} must be a base64-encoded 32-byte key.`);
  }
  return key;
}

function deriveKey(masterKey, purpose) {
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), `srsb-hrms:${purpose}:v1`, KEY_BYTES));
}

function requireContext(context) {
  if (typeof context !== 'string' || !context.trim()) {
    throw new TypeError('An encryption context (for example "table.column:rowId") is required.');
  }
  return Buffer.from(context, 'utf8');
}

export class Keyring {
  #fieldKeys = new Map();
  #fileKeys = new Map();
  #blindIndexKey;

  constructor({ keys, activeKeyId, blindIndexKey }) {
    if (!(keys instanceof Map) || keys.size === 0) {
      throw new EncryptionConfigError('At least one field encryption key is required.');
    }
    if (!keys.has(activeKeyId)) {
      throw new EncryptionConfigError('FIELD_ENCRYPTION_ACTIVE_KEY_ID must name one of the configured keys.');
    }
    for (const [id, master] of keys) {
      if (blindIndexKey.equals(master)) {
        throw new EncryptionConfigError('BLIND_INDEX_KEY must be different from every field encryption key.');
      }
      this.#fieldKeys.set(id, deriveKey(master, 'field'));
      this.#fileKeys.set(id, deriveKey(master, 'file'));
    }
    this.#blindIndexKey = Buffer.from(blindIndexKey);
    this.activeKeyId = activeKeyId;
    Object.freeze(this);
  }

  get keyIds() {
    return [...this.#fieldKeys.keys()];
  }

  fieldKey(keyId) {
    const key = this.#fieldKeys.get(keyId);
    if (!key) throw new DecryptionError('Encrypted value uses an unknown key id.');
    return key;
  }

  fileKey(keyId) {
    const key = this.#fileKeys.get(keyId);
    if (!key) throw new DecryptionError('Encrypted file uses an unknown key id.');
    return key;
  }

  blindIndexKey() {
    return this.#blindIndexKey;
  }

  toJSON() {
    return { activeKeyId: this.activeKeyId, keyIds: this.keyIds };
  }

  [util.inspect.custom]() {
    return `Keyring { activeKeyId: '${this.activeKeyId}', keyIds: [${this.keyIds.map((id) => `'${id}'`).join(', ')}] }`;
  }
}

export function loadKeyring(env = process.env) {
  const raw = env.FIELD_ENCRYPTION_KEYS;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new EncryptionConfigError('FIELD_ENCRYPTION_KEYS is not configured.');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EncryptionConfigError('FIELD_ENCRYPTION_KEYS must be a JSON object of keyId to base64 key.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new EncryptionConfigError('FIELD_ENCRYPTION_KEYS must be a JSON object of keyId to base64 key.');
  }
  const keys = new Map();
  for (const [id, value] of Object.entries(parsed)) {
    if (!KEY_ID_PATTERN.test(id)) {
      throw new EncryptionConfigError('Encryption key ids may only use letters, digits, "_" and "-" (max 32).');
    }
    keys.set(id, decodeKey(`Encryption key "${id}"`, value));
  }
  const activeKeyId = String(env.FIELD_ENCRYPTION_ACTIVE_KEY_ID || '').trim();
  const blindIndexKey = decodeKey('BLIND_INDEX_KEY', env.BLIND_INDEX_KEY);
  return new Keyring({ keys, activeKeyId, blindIndexKey });
}

let cachedKeyring = null;

// Lazily loads the process keyring so the app only needs keys once encryption is in use.
export function getKeyring() {
  if (!cachedKeyring) cachedKeyring = loadKeyring(process.env);
  return cachedKeyring;
}

export function isEncryptedField(value) {
  return typeof value === 'string' && FIELD_PATTERN.test(value);
}

export function encryptField(plaintext, { context, keyring = getKeyring() } = {}) {
  if (plaintext == null || plaintext === '') return null;
  const aad = requireContext(context);
  const keyId = keyring.activeKeyId;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyring.fieldKey(keyId), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FIELD_VERSION, keyId, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

export function decryptField(payload, { context, keyring = getKeyring() } = {}) {
  if (payload == null || payload === '') return null;
  const aad = requireContext(context);
  const match = typeof payload === 'string' ? FIELD_PATTERN.exec(payload) : null;
  if (!match) throw new DecryptionError('Value is not in the expected encrypted format.');
  const [, keyId, ivText, tagText, ciphertextText] = match;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, keyring.fieldKey(keyId), Buffer.from(ivText, 'base64url'), {
      authTagLength: TAG_BYTES
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof DecryptionError) throw error;
    throw new DecryptionError();
  }
}

export function fieldKeyId(payload) {
  const match = typeof payload === 'string' ? FIELD_PATTERN.exec(payload) : null;
  return match ? match[1] : null;
}

// True when a stored value should be re-encrypted with the active key (key rotation).
export function needsReencryption(payload, keyring = getKeyring()) {
  const keyId = fieldKeyId(payload);
  return keyId != null && keyId !== keyring.activeKeyId;
}

export function normalizeIdentifier(value) {
  if (value == null) return '';
  return String(value).replace(/[\s-]/g, '').toUpperCase();
}

// Deterministic HMAC for equality lookups and duplicate checks without decrypting.
export function blindIndex(value, { purpose, keyring = getKeyring() } = {}) {
  const normalized = normalizeIdentifier(value);
  if (!normalized) return null;
  if (typeof purpose !== 'string' || !purpose.trim()) {
    throw new TypeError('A blind index purpose (for example "bank_account") is required.');
  }
  return crypto.createHmac('sha256', keyring.blindIndexKey()).update(`${purpose}\u0000${normalized}`).digest('hex');
}

// Last four characters for masked display; withheld when the value is too short to mask safely.
export function lastFour(value) {
  const normalized = normalizeIdentifier(value);
  return normalized.length >= 5 ? normalized.slice(-4) : null;
}

/*
 * File layout: MAGIC(8) | keyIdLength(1) | keyId | IV(12) | TAG(16) | ciphertext
 */
export function isEncryptedFile(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > FILE_MAGIC.length && buffer.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC);
}

export function encryptFile(buffer, { context, keyring = getKeyring() } = {}) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('encryptFile expects a Buffer.');
  const aad = requireContext(context);
  const keyId = keyring.activeKeyId;
  const keyIdBytes = Buffer.from(keyId, 'ascii');
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyring.fileKey(keyId), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([FILE_MAGIC, Buffer.from([keyIdBytes.length]), keyIdBytes, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptFile(buffer, { context, keyring = getKeyring() } = {}) {
  const aad = requireContext(context);
  if (!isEncryptedFile(buffer)) throw new DecryptionError('File is not in the expected encrypted format.');
  let offset = FILE_MAGIC.length;
  const keyIdLength = buffer[offset];
  offset += 1;
  if (!keyIdLength || buffer.length < offset + keyIdLength + IV_BYTES + TAG_BYTES) {
    throw new DecryptionError('File is not in the expected encrypted format.');
  }
  const keyId = buffer.subarray(offset, offset + keyIdLength).toString('ascii');
  offset += keyIdLength;
  const iv = buffer.subarray(offset, offset + IV_BYTES);
  offset += IV_BYTES;
  const tag = buffer.subarray(offset, offset + TAG_BYTES);
  offset += TAG_BYTES;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, keyring.fileKey(keyId), iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(buffer.subarray(offset)), decipher.final()]);
  } catch (error) {
    if (error instanceof DecryptionError) throw error;
    throw new DecryptionError('Encrypted file could not be decrypted.');
  }
}
