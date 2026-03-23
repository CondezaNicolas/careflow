import { authClient } from "@/features/auth/api/auth-client";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { toApiUrl } from "@/lib/env";

interface ApiRequestOptions extends RequestInit {
  requiresAuth?: boolean;
  retryOnUnauthorized?: boolean;
}

interface ApiClientDependencies {
  fetch?: typeof fetch;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly response: Response;

  constructor(message: string, response: Response) {
    super(message);
    this.name = "ApiClientError";
    this.status = response.status;
    this.response = response;
  }
}

let refreshInFlight: Promise<ReturnType<typeof useAuthStore.getState>["session"]> | null = null;

async function refreshAuthSession() {
  if (!refreshInFlight) {
    refreshInFlight = useAuthStore
      .getState()
      .refresh()
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

async function readResponseMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? `Request failed with status ${response.status}`;
  }

  const text = await response.text();
  return text || `Request failed with status ${response.status}`;
}

export function createApiClient({ fetch: fetchImpl = fetch }: ApiClientDependencies = {}) {
  async function execute(
    pathname: string,
    options: ApiRequestOptions = {},
    accessToken?: string
  ): Promise<Response> {
    const headers = new Headers(options.headers);

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    if (options.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    return fetchImpl(toApiUrl(pathname), {
      ...options,
      credentials: "include",
      headers
    });
  }

  return {
    async request(pathname: string, options: ApiRequestOptions = {}): Promise<Response> {
      const currentSession = useAuthStore.getState().session;
      const requiresAuth = options.requiresAuth ?? true;
      const shouldRetry = options.retryOnUnauthorized ?? true;

      if (requiresAuth && !currentSession?.accessToken) {
        throw new Error("Authenticated request requires an active session");
      }

      let response = await execute(pathname, options, currentSession?.accessToken);

      if (response.status !== 401 || !shouldRetry || !currentSession?.refreshToken) {
        return response;
      }

      const refreshedSession = await refreshAuthSession();

      if (!refreshedSession?.accessToken) {
        return response;
      }

      response = await execute(pathname, options, refreshedSession.accessToken);
      return response;
    },

    async json<T>(pathname: string, options: ApiRequestOptions = {}): Promise<T> {
      const response = await this.request(pathname, options);

      if (!response.ok) {
        throw new ApiClientError(await readResponseMessage(response), response);
      }

      return (await response.json()) as T;
    },

    async logoutCurrentSession() {
      const session = useAuthStore.getState().session;

      if (!session?.refreshToken) {
        useAuthStore.getState().clearSession();
        return;
      }

      await authClient.logout({ refreshToken: session.refreshToken }, session.accessToken);
      useAuthStore.getState().clearSession();
    }
  };
}

export const apiClient = createApiClient();
