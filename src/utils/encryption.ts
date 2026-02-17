import crypto from 'crypto';
import { config } from '../config/index.js';

// ============================================
// Encryption Service Interface (SOLID - ISP)
// ============================================
export interface IEncryptionService {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  hash(data: string): string;
  compareHash(data: string, hash: string): boolean;
}

// ============================================
// AES-256-GCM Encryption Implementation
// ============================================
export class EncryptionService implements IEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly authTagLength = 16; // 128 bits
  private readonly key: Buffer;

  constructor() {
    // Derive a proper key from the config encryption key
    this.key = this.deriveKey(config.encryption.key);
  }

  /**
   * Derive a proper 256-bit key from the provided key string
   */
  private deriveKey(keyString: string): Buffer {
    return crypto.scryptSync(keyString, 'healthpilot-salt', this.keyLength);
  }

  /**
   * Encrypt plaintext using AES-256-GCM
   * Returns: iv:authTag:ciphertext (base64 encoded)
   */
  encrypt(plaintext: string): string {
    // Generate random IV
    const iv = crypto.randomBytes(this.ivLength);

    // Create cipher
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv, {
      authTagLength: this.authTagLength,
    });

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Combine: iv:authTag:ciphertext
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypt ciphertext using AES-256-GCM
   * Input format: iv:authTag:ciphertext (base64 encoded)
   */
  decrypt(ciphertext: string): string {
    // Split components
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }

    const [ivBase64, authTagBase64, encryptedBase64] = parts;

    if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
      throw new Error('Invalid ciphertext components');
    }

    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    // Create decipher
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv, {
      authTagLength: this.authTagLength,
    });

    // Set auth tag
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Create a SHA-256 hash of data
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Compare data with a hash
   */
  compareHash(data: string, hashValue: string): boolean {
    const dataHash = this.hash(data);
    return crypto.timingSafeEqual(Buffer.from(dataHash), Buffer.from(hashValue));
  }
}

// ============================================
// Singleton Instance
// ============================================
export const encryptionService = new EncryptionService();
export default encryptionService;
