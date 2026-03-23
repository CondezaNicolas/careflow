import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { authClient } from "@/features/auth/api/auth-client";
import {
  buildSessionFromDevLoginResponse,
  buildSessionFromTokenResponse,
  getActiveSession
} from "@/features/auth/auth-session";
import type {
  AuthRequest,
  AuthStateEvent,
  AuthStatus,
  DevLoginInput,
  LoginInput,
  PersistedAuthSession
} from "@/features/auth/auth.types";
import { AUTH_REQUEST, AUTH_STATE_EVENT, AUTH_STATUS } from "@/features/auth/auth.types";

const AUTH_STORAGE_KEY = "lia-clinic.auth-session";

function toAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to complete the authentication request.";
}

interface AuthStoreState {
  isHydrated: boolean;
  session: PersistedAuthSession | null;
  status: AuthStatus;
  lastEvent: AuthStateEvent | null;
  activeRequest: AuthRequest | null;
  authError: string | null;
  hydrate: () => Promise<void>;
  login: (input: LoginInput) => Promise<PersistedAuthSession>;
  devLogin: (input?: DevLoginInput) => Promise<PersistedAuthSession>;
  refresh: () => Promise<PersistedAuthSession | null>;
  logout: () => Promise<void>;
  clearSession: (event?: AuthStateEvent | null) => void;
  clearError: () => void;
  clearEvent: () => void;
  setSession: (session: PersistedAuthSession) => PersistedAuthSession;
}

function createBrowserStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0
  };
}

function resolveStorage(): Storage {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }

  return createBrowserStorage();
}

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set, get) => ({
      isHydrated: false,
      session: null,
      status: AUTH_STATUS.ANONYMOUS,
      lastEvent: null,
      activeRequest: null,
      authError: null,

      hydrate: async () => {
        await useAuthStore.persist.rehydrate();
      },

      setSession: (session) => {
        set({
          session,
          status: AUTH_STATUS.AUTHENTICATED,
          lastEvent: null,
          activeRequest: null,
          authError: null
        });
        return session;
      },

      clearSession: (event = null) => {
        set({
          session: null,
          status: AUTH_STATUS.ANONYMOUS,
          lastEvent: event,
          activeRequest: null
        });
      },

      clearError: () => {
        set({ authError: null });
      },

      clearEvent: () => {
        set({ lastEvent: null });
      },

      login: async (input) => {
        set({ activeRequest: AUTH_REQUEST.LOGIN, authError: null });

        try {
          const response = await authClient.login(input);
          return get().setSession(buildSessionFromTokenResponse(response));
        } catch (error) {
          set({
            activeRequest: null,
            authError: toAuthErrorMessage(error)
          });
          throw error;
        }
      },

      devLogin: async (input) => {
        set({ activeRequest: AUTH_REQUEST.DEV_LOGIN, authError: null });

        try {
          const response = await authClient.devLogin(input);
          return get().setSession(buildSessionFromDevLoginResponse(response));
        } catch (error) {
          set({
            activeRequest: null,
            authError: toAuthErrorMessage(error)
          });
          throw error;
        }
      },

      refresh: async () => {
        set({ activeRequest: AUTH_REQUEST.REFRESH, authError: null });

        const refreshToken = get().session?.refreshToken;

        if (!refreshToken) {
          get().clearSession();
          return null;
        }

        try {
          const response = await authClient.refresh(refreshToken);
          return get().setSession(buildSessionFromTokenResponse(response));
        } catch {
          get().clearSession(AUTH_STATE_EVENT.SESSION_EXPIRED);
          return null;
        }
      },

      logout: async () => {
        set({ activeRequest: AUTH_REQUEST.LOGOUT, authError: null });

        const currentSession = get().session;

        if (!currentSession) {
          get().clearSession(AUTH_STATE_EVENT.SIGNED_OUT);
          return;
        }

        try {
          if (currentSession.refreshToken) {
            await authClient.logout(
              { refreshToken: currentSession.refreshToken },
              currentSession.accessToken
            );
          }
        } finally {
          get().clearSession(AUTH_STATE_EVENT.SIGNED_OUT);
        }
      }
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(resolveStorage),
      skipHydration: true,
      partialize: (state) => ({
        session: state.session,
        status: state.status
      }),
      onRehydrateStorage: () => (state) => {
        const persistedSession = state?.session ?? null;
        const activeSession = getActiveSession(persistedSession);
        const didExpirePersistedSession = Boolean(persistedSession) && !activeSession;

        useAuthStore.setState({
          activeRequest: null,
          authError: null,
          isHydrated: true,
          lastEvent: didExpirePersistedSession ? AUTH_STATE_EVENT.SESSION_EXPIRED : null,
          session: activeSession,
          status: activeSession ? AUTH_STATUS.AUTHENTICATED : AUTH_STATUS.ANONYMOUS
        });
      }
    }
  )
);
