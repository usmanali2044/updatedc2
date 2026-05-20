const crypto = require('crypto');
const { loadOptions } = require('./options');

const ENCRYPTED_VALUE_PREFIX = 'enc:v1:';
const DEFAULT_AES_KEY = 'gc2-default-embedded-aes-key-2026-keep-this-in-sync';

function resolveAesSecret() {
  const opts = loadOptions();
  return String(opts.aesKey || DEFAULT_AES_KEY);
}

function deriveAesKey(secret = resolveAesSecret()) {
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest();
}

function encryptCellValue(value, secret = resolveAesSecret()) {
  if (value === undefined || value === null || value === '') return value ?? '';

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveAesKey(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_VALUE_PREFIX}${Buffer.concat([iv, encrypted, tag]).toString('base64')}`;
}

function decryptCellValue(value, secret = resolveAesSecret()) {
  if (value === undefined || value === null || value === '') return value ?? '';

  const text = String(value);
  if (!text.startsWith(ENCRYPTED_VALUE_PREFIX)) return text;

  const payload = Buffer.from(text.slice(ENCRYPTED_VALUE_PREFIX.length), 'base64');
  if (payload.length < 12 + 16) {
    throw new Error('Encrypted sheet cell is too short');
  }

  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(payload.length - 16);
  const encrypted = payload.subarray(12, payload.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveAesKey(secret), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = {
  decryptCellValue,
  encryptCellValue,
};
