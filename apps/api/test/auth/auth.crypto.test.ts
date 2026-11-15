import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashToken,
  randomToken,
} from "../../src/auth/auth.crypto.js";

describe("auth crypto helpers", () => {
  it("generates a token and a deterministic non-reversible lookup hash", () => {
    const token = randomToken(32);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(30);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it("encrypts and decrypts provider secrets", () => {
    const key = Buffer.alloc(32, 9);
    const encrypted = encryptSecret("refresh-token-value", key);

    expect(encrypted.ciphertext).not.toContain("refresh-token-value");
    expect(decryptSecret(encrypted, key)).toBe("refresh-token-value");
  });

  it("rejects tampered encrypted secrets", () => {
    const key = Buffer.alloc(32, 9);
    const encrypted = encryptSecret("refresh-token-value", key);
    encrypted.ciphertext = `${encrypted.ciphertext.slice(0, -2)}xx`;

    expect(() => decryptSecret(encrypted, key)).toThrow();
  });
});
