import { useShallow } from "zustand/react/shallow";

import { AUTH_REQUEST } from "@/features/auth/auth.types";
import { useAuthStore } from "@/features/auth/store/auth-store";

export function useAuthSession() {
  return useAuthStore((state) => state.session);
}

export function useAuthReady() {
  return useAuthStore((state) => state.isHydrated);
}

export function useIsAuthenticated() {
  return useAuthStore((state) => state.status === "authenticated");
}

export function useAuthError() {
  return useAuthStore((state) => state.authError);
}

export function useAuthEvent() {
  return useAuthStore((state) => state.lastEvent);
}

export function useAuthRequest() {
  return useAuthStore((state) => state.activeRequest);
}

export function useIsAuthBusy() {
  return useAuthStore((state) => state.activeRequest !== null);
}

export function useIsAuthRefreshing() {
  return useAuthStore((state) => state.activeRequest === AUTH_REQUEST.REFRESH);
}

export function useAuthActions() {
  return useAuthStore(
    useShallow((state) => ({
      login: state.login,
      devLogin: state.devLogin,
      refresh: state.refresh,
      logout: state.logout,
      clearSession: state.clearSession,
      clearError: state.clearError,
      clearEvent: state.clearEvent
    }))
  );
}
