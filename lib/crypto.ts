import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const AES_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended for GCM

class EncryptionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EncryptionError';
  }
}

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new EncryptionError('Missing ENCRYPTION_KEY environment variable. Provide a base64 encoded 32-byte key.');
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(rawKey, 'base64');
  } catch (error) {
    throw new EncryptionError('ENCRYPTION_KEY must be base64 encoded.', error);
  }

  if (decoded.length !== 32) {
    throw new EncryptionError('ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM.');
  }

  cachedKey = decoded;
  return cachedKey;
}

export function encrypt(plainText: string): string {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(AES_ALGO, key, iv, {
      authTagLength: 16,
    });
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = `${iv.toString('base64')}|${ciphertext.toString('base64')}|${tag.toString('base64')}`;
    return Buffer.from(payload, 'utf8').toString('base64');
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw error;
    }
    throw new EncryptionError('Failed to encrypt value.', error);
  }
}

export function decrypt(payload: string): string {
  try {
    const key = getEncryptionKey();
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const parts = decoded.split('|');
    if (parts.length !== 3) {
      throw new EncryptionError('Invalid ciphertext format. Expected iv|ciphertext|tag structure.');
    }

    const [ivB64, cipherB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const ciphertext = Buffer.from(cipherB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');

    const decipher = createDecipheriv(AES_ALGO, key, iv, {
      authTagLength: tag.length,
    });
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw error;
    }
    throw new EncryptionError('Unable to decrypt payload. It may be corrupted or the key is invalid.', error);
  }
}

export { EncryptionError };
