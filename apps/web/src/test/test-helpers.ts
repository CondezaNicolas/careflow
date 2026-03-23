import assert from "node:assert/strict";

import type { JwtClaims } from "@/features/auth/auth.types";

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createJwt(claims: Partial<JwtClaims> = {}): string {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "user-1",
    email: "user@example.com",
    role: "admin",
    tenantId: "tenant-1",
    iat: nowInSeconds,
    exp: nowInSeconds + 900,
    ...claims
  };

  return [
    encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    encodeBase64Url(JSON.stringify(payload)),
    "signature"
  ].join(".");
}

export function installMockLocalStorage() {
  const store = new Map<string, string>();

  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    }
  } satisfies Storage;

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage
    }
  });

  return localStorage;
}

export function assertIsDefined<T>(value: T | undefined | null): asserts value is T {
  assert.notEqual(value, undefined);
  assert.notEqual(value, null);
}
