import type {
  DevLoginInput,
  DevLoginResponse,
  LoginInput,
  LogoutInput,
  LogoutResponse,
  TokenResponse
} from "@/features/auth/auth.types";
import {
  parseDevLoginResponse,
  parseLoginInput,
  parseLogoutResponse,
  parseRefreshInput,
  parseTokenResponse
} from "@/features/auth/auth.schemas";
import { env, toApiUrl } from "@/lib/env";

interface AuthClientDependencies {
  apiUrl?: string;
  fetch?: typeof fetch;
}

export class AuthApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? `Auth request failed with status ${response.status}`;
  }

  const text = await response.text();
  return text || `Auth request failed with status ${response.status}`;
}

export function createAuthClient({
  apiUrl = env.apiUrl,
  fetch: fetchImpl = fetch
}: AuthClientDependencies = {}) {
  async function request<T>(
    pathname: string,
    init: RequestInit,
    parser: (input: unknown) => T
  ): Promise<T> {
    const response = await fetchImpl(new URL(pathname, apiUrl).toString(), {
      credentials: "include",
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      throw new AuthApiError(await readErrorMessage(response), response.status);
    }

    return parser((await response.json()) as unknown);
  }

  return {
    async login(input: LoginInput): Promise<TokenResponse> {
      const body = parseLoginInput(input);
      return request(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify(body)
        },
        parseTokenResponse
      );
    },

    async refresh(refreshToken: string): Promise<TokenResponse> {
      const body = parseRefreshInput({ refreshToken });
      return request(
        "/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify(body)
        },
        parseTokenResponse
      );
    },

    async logout(input: LogoutInput, accessToken: string): Promise<LogoutResponse> {
      return request(
        "/auth/logout",
        {
          method: "POST",
          body: JSON.stringify(parseRefreshInput(input)),
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        },
        parseLogoutResponse
      );
    },

    async devLogin(input: DevLoginInput = {}): Promise<DevLoginResponse> {
      const searchParams = new URLSearchParams();

      if (input.role) {
        searchParams.set("role", input.role);
      }

      if (input.redirect) {
        searchParams.set("redirect", input.redirect);
      }

      const pathname = `/auth/dev-login${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`;

      return request(
        pathname,
        {
          method: "GET"
        },
        parseDevLoginResponse
      );
    },

    toUrl(pathname: string): string {
      return new URL(pathname, apiUrl).toString();
    }
  };
}

export const authClient = createAuthClient({ apiUrl: toApiUrl("/") });
