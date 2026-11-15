import { jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";
import type { AccessTokenClaims } from "./auth.types.js";

interface VerifierConfig {
  issuer: string;
  clientId: string;
}

type TokenPayload = {
  iss?: string;
  sub?: string;
  exp?: number;
  client_id?: string;
  token_use?: string;
};

export class AccessTokenVerifier {
  constructor(
    private readonly config: VerifierConfig,
    private readonly jwks: JWTVerifyGetKey,
  ) {}

  async verify(token: string): Promise<AccessTokenClaims> {
    const result = await jwtVerify<TokenPayload>(token, this.jwks, {
      issuer: this.config.issuer,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iss", "sub"],
    });
    const payload = result.payload;

    if (payload.token_use !== "access") {
      throw new Error("Only access tokens are accepted");
    }
    if (payload.client_id !== this.config.clientId) {
      throw new Error("Access token client does not match configured client");
    }
    if (!payload.sub || !payload.iss || !payload.exp) {
      throw new Error("Access token is missing required claims");
    }

    return {
      issuer: payload.iss,
      subject: payload.sub,
      clientId: payload.client_id,
      tokenUse: "access",
      expiresAt: payload.exp,
    };
  }
}
