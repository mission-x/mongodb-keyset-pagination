import crypto from 'node:crypto';
import type {BinaryLike} from 'node:crypto';

interface EncryptionOptions {
    algorithm?: 'aes-128-cbc',
    iv?: BinaryLike,
    ivLength?: number
}

export default class Encryption {
    private readonly secret: string;
    private readonly algorithm: 'aes-128-cbc';
    private readonly iv: BinaryLike;
    private readonly ivLength: any;

    constructor(secret: string, options: EncryptionOptions = {}) {
        this.secret = secret;
        this.algorithm = options.algorithm ?? 'aes-128-cbc';
        this.iv = options.iv;
        this.ivLength = typeof this.iv === "string" ? this.iv.length : options.ivLength ?? 16
    }

    encrypt(payload: object | string) {
        if (typeof payload !== 'string') {
            try {
                payload = JSON.stringify(payload);
            } catch (err) {
                throw err;
            }
        }

        const iv = this.iv ?? crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipheriv(
            this.algorithm,
            Buffer.from(this.secret),
            iv
        );

        let encrypted = cipher.update(payload, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        return `${iv.toString('hex')}${encrypted.toString('hex')}`;
    }

    decrypt(str: string): object | string {
        const ivHexLength = 2 * this.ivLength;
        const ivPart = str.slice(0, ivHexLength);
        const encryptedPart = str.slice(ivHexLength);
        const iv = Buffer.from(ivPart, 'hex');
        const encryptedText = Buffer.from(encryptedPart, 'hex');

        const decipher = crypto.createDecipheriv(
            this.algorithm,
            Buffer.from(this.secret),
            iv
        );

        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        try {
            return JSON.parse(decrypted.toString());
        } catch (err) {
            return decrypted.toString();
        }
    }
}
