import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { USER_ROLE } from "../common/constants/user-role.js";
import { parseEnv } from "../config/env.js";
import type { OidcProfile } from "./auth.types.js";

interface OidcDiscoveryDocument {
  issuer: string;
  token_endpoint: string;
  jwks_uri: string;
}

interface OidcTokenResponse {
  access_token?: string;
  id_token?: string;
}

@Injectable()
export class OidcClient {
  private readonly env = parseEnv(process.env);
  private readonly discoveryUrl = new URL(".well-known/openid-configuration", this.env.OIDC_ISSUER).toString();
  private jwks = createRemoteJWKSet(new URL("jwks", this.env.OIDC_ISSUER));

  async exchangeCodeForProfile(code: string): Promise<OidcProfile> {
    const discovery = await this.fetchDiscoveryDocument();
    const tokens = await this.exchangeCodeForTokens(code, discovery.token_endpoint);
    const idToken = tokens.id_token;
    if (!idToken) {
      throw new UnauthorizedException("OIDC provider response did not include id_token");
    }

    const verified = await jwtVerify(idToken, this.jwks, {
      issuer: discovery.issuer,
      audience: this.env.OIDC_AUDIENCE ?? this.env.OIDC_CLIENT_ID
    });

    const tenantId = this.getRequiredClaim(verified.payload, this.env.OIDC_TENANT_CLAIM);
    const role = this.parseRole(this.getRequiredClaim(verified.payload, this.env.OIDC_ROLE_CLAIM));
    const email = this.getRequiredClaim(verified.payload, "email");

    if (!verified.payload.sub) {
      throw new UnauthorizedException("OIDC id_token missing sub claim");
    }

    return {
      subject: verified.payload.sub,
      email,
      tenantId,
      role
    };
  }

  private async fetchDiscoveryDocument(): Promise<OidcDiscoveryDocument> {
    const response = await fetch(this.discoveryUrl);
    if (!response.ok) {
      throw new UnauthorizedException(`OIDC discovery failed with status ${response.status}`);
    }

    const payload = (await response.json()) as Partial<OidcDiscoveryDocument>;
    if (!payload.issuer || !payload.token_endpoint || !payload.jwks_uri) {
      throw new UnauthorizedException("OIDC discovery response missing required fields");
    }

    this.refreshJwks(payload.jwks_uri);
    return payload as OidcDiscoveryDocument;
  }

  private async exchangeCodeForTokens(
    code: string,
    tokenEndpoint: string
  ): Promise<OidcTokenResponse> {
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.env.OIDC_REDIRECT_URI,
      client_id: this.env.OIDC_CLIENT_ID,
      client_secret: this.env.OIDC_CLIENT_SECRET
    });

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });

    if (!response.ok) {
      throw new UnauthorizedException(`OIDC token exchange failed with status ${response.status}`);
    }

    return (await response.json()) as OidcTokenResponse;
  }

  private getRequiredClaim(payload: JWTPayload, claimName: string): string {
    const value = payload[claimName];
    if (typeof value !== "string" || value.length === 0) {
      throw new UnauthorizedException(`OIDC id_token missing claim ${claimName}`);
    }

    return value;
  }

  private parseRole(value: string): OidcProfile["role"] {
    const validRoles = new Set(Object.values(USER_ROLE));
    if (!validRoles.has(value as OidcProfile["role"])) {
      throw new UnauthorizedException(`OIDC id_token has unsupported role ${value}`);
    }

    return value as OidcProfile["role"];
  }

  private refreshJwks(jwksUri: string): void {
    this.jwks = createRemoteJWKSet(new URL(jwksUri));
  }
}
