import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

@Injectable()
export class CDigitalUsersCrypto {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const rawKey = config.get<string>('C_DIGITAL_USERS_ENCRYPTION_KEY');
    if (!rawKey || !rawKey.trim()) {
      throw new Error('C_DIGITAL_USERS_ENCRYPTION_KEY is required');
    }

    this.key = createHash('sha256').update(rawKey).digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  decrypt(value: string): string {
    const [ivBase64, authTagBase64, encryptedBase64] = value.split(':');
    if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
      throw new Error('Invalid encrypted C Digital password payload');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
