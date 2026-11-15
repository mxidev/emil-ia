import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { EncryptedSecret } from "./auth.types.js";

const ALGORITHM = "aes-256-gcm";

export function randomToken(bytes: number): string {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error("Token byte length must be a positive integer");
  }
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function encryptSecret(value: string, key: Buffer): EncryptedSecret {
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: authTag.toString("base64url"),
  };
}

export function decryptSecret(secret: EncryptedSecret, key: Buffer): string {
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(secret.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
