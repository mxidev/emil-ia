import { describe, expect, it, vi } from "vitest";
import { OidcClient } from "../../src/auth/oidc.client.js";

const config = {
  issuer: "http://localhost:4566/pool-123",
  clientId: "client-123",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OidcClient", () => {
  it("discovers endpoints and builds a PKCE authorization URL", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        authorization_endpoint: "https://login.example/authorize",
        token_endpoint: "https://login.example/token",
        revocation_endpoint: "https://login.example/revoke",
        userinfo_endpoint: "https://login.example/userinfo",
        jwks_uri: "https://login.example/jwks",
      }),
    );
    const client = new OidcClient(config, fetchImpl);

    const url = await client.getAuthorizationUrl({
      redirectUri: "http://localhost:3000/api/auth/callback",
      state: "state-value",
      nonce: "nonce-value",
      codeChallenge: "challenge-value",
    });
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe("https://login.example/authorize");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe(config.clientId);
    expect(parsed.searchParams.get("scope")).toBe("openid email");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("exchanges an authorization code and refreshes provider tokens", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          authorization_endpoint: "https://login.example/authorize",
          token_endpoint: "https://login.example/token",
          jwks_uri: "https://login.example/jwks",
        }),
      )
      .mockResolvedValueOnce(
        response({ access_token: "access", refresh_token: "refresh", expires_in: 300, id_token: "id" }),
      )
      .mockResolvedValueOnce(
        response({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 600 }),
      );
    const client = new OidcClient(config, fetchImpl);

    await expect(
      client.exchangeCode("code", "http://localhost:3000/api/auth/callback", "verifier"),
    ).resolves.toMatchObject({ accessToken: "access", refreshToken: "refresh" });
    await expect(client.refresh("refresh")).resolves.toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
