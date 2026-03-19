import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

import { OidcClient } from "./oidc.client.js";

describe("OidcClient", () => {
  let oidcServer: ReturnType<typeof createServer> | undefined;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://lia:lia@localhost:5432/lia_clinic";
    process.env.OIDC_CLIENT_ID = "client-id";
    process.env.OIDC_CLIENT_SECRET = "client-secret";
    process.env.OIDC_REDIRECT_URI = "http://localhost:3001/auth/callback";
    process.env.OIDC_AUDIENCE = "client-id";
    process.env.OIDC_TENANT_CLAIM = "tenant_id";
    process.env.OIDC_ROLE_CLAIM = "role";
    process.env.SESSION_COOKIE_NAME = "lia_session";
    process.env.SESSION_TTL_MINUTES = "60";
  });

  afterEach(async () => {
    if (oidcServer) {
      await new Promise<void>((resolve, reject) => {
        oidcServer?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      oidcServer = undefined;
    }
  });

  it("exchanges code and verifies id_token through JWKS", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "kid-1";

    oidcServer = createServer(async (request: IncomingMessage, response: ServerResponse) => {
      const baseUrl = `http://${request.headers.host}`;
      const requestUrl = new URL(request.url ?? "/", baseUrl);
      const issuer = `${baseUrl}/`;

      if (request.method === "GET" && requestUrl.pathname === "/.well-known/openid-configuration") {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            issuer,
            token_endpoint: `${baseUrl}/oauth/token`,
            jwks_uri: `${baseUrl}/.well-known/jwks.json`
          })
        );
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/oauth/token") {
        const idToken = await new SignJWT({
          email: "clinician@lia.local",
          tenant_id: "tenant-demo",
          role: "clinician"
        })
          .setProtectedHeader({ alg: "RS256", kid: "kid-1" })
          .setSubject("oidc-user-1")
          .setIssuer(issuer)
          .setAudience("client-id")
          .setExpirationTime("10m")
          .setIssuedAt()
          .sign(privateKey);

        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ id_token: idToken }));
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/.well-known/jwks.json") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ keys: [publicJwk] }));
        return;
      }

      response.statusCode = 404;
      response.end("not found");
    });

    await new Promise<void>((resolve, reject) => {
      oidcServer?.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const address = oidcServer.address() as AddressInfo;
    process.env.OIDC_ISSUER = `http://127.0.0.1:${address.port}/`;

    const client = new OidcClient();
    const profile = await client.exchangeCodeForProfile("valid-code");

    assert.equal(profile.subject, "oidc-user-1");
    assert.equal(profile.email, "clinician@lia.local");
    assert.equal(profile.tenantId, "tenant-demo");
    assert.equal(profile.role, "clinician");
  });
});
