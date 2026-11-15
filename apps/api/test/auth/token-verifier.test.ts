import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { AccessTokenVerifier } from "../../src/auth/token-verifier.js";

const issuer = "http://localhost:4566/pool-123";
const clientId = "client-123";
let privateKey: Parameters<SignJWT["sign"]>[0];
let verifier: AccessTokenVerifier;

async function signedToken(overrides: Record<string, unknown> = {}): Promise<string> {
  const { iss = issuer, ...claims } = overrides;
  return new SignJWT({
    token_use: "access",
    client_id: clientId,
    sub: "subject-123",
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(String(iss))
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

beforeAll(async () => {
  const keys = await generateKeyPair("RS256");
  privateKey = keys.privateKey;
  const publicJwk = await exportJWK(keys.publicKey);
  verifier = new AccessTokenVerifier(
    { issuer, clientId },
    createLocalJWKSet({ keys: [{ ...publicJwk, kid: "test-key", alg: "RS256" }] }),
  );
});

describe("AccessTokenVerifier", () => {
  it("accepts a valid access token and returns its identity claims", async () => {
    await expect(verifier.verify(await signedToken())).resolves.toMatchObject({
      issuer,
      subject: "subject-123",
      clientId,
      tokenUse: "access",
    });
  });

  it.each([
    ["wrong issuer", { iss: "https://other.example" }],
    ["wrong client", { client_id: "other-client" }],
    ["ID token", { token_use: "id" }],
    ["missing subject", { sub: undefined }],
  ])("rejects %s", async (_name, overrides) => {
    const token = await signedToken(overrides);
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it("rejects expired tokens and tokens signed by another key", async () => {
    const expired = await new SignJWT({
      token_use: "access",
      client_id: clientId,
      sub: "subject-123",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setIssuedAt(0)
      .setExpirationTime(0)
      .sign(privateKey);
    await expect(verifier.verify(expired)).rejects.toThrow();

    const otherKeys = await generateKeyPair("RS256");
    const wrongSignature = await new SignJWT({
      token_use: "access",
      client_id: clientId,
      sub: "subject-123",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(otherKeys.privateKey);
    await expect(verifier.verify(wrongSignature)).rejects.toThrow();
  });
});
