"use client";

import { LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  useAuthActions,
  useAuthEvent,
  useAuthReady,
  useAuthSession
} from "@/features/auth/hooks/use-auth";
import {
  buildLoginRoute,
  LOGIN_REDIRECT_REASON,
  resolveProtectedRoute
} from "@/features/auth/routing/protected-route";
import { getRoleLabel } from "@/lib/auth/role-routes";

interface ProtectedLayoutProps {
  children: ReactNode;
}

export function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isReady = useAuthReady();
  const session = useAuthSession();
  const authEvent = useAuthEvent();
  const { logout } = useAuthActions();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const resolution = resolveProtectedRoute({
    authEvent,
    isReady,
    pathname,
    session
  });
  const statusMessage =
    resolution.kind === "allow" ? "Opening your workspace..." : resolution.message;

  useEffect(() => {
    if (resolution.kind === "redirect-login" || resolution.kind === "redirect-role") {
      router.replace(resolution.href);
    }
  }, [resolution, router]);

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await logout();
      router.replace(buildLoginRoute(LOGIN_REDIRECT_REASON.SIGNED_OUT));
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (resolution.kind !== "allow" || !session) {
    return (
      <main className="shell">
        <section className="panel status-panel">
          <p className="eyebrow">Protected workspace</p>
          <h1>Checking your session...</h1>
          <p>{statusMessage}</p>
        </section>
      </main>
    );
  }

  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <div className="protected-app">
      <header className="protected-header">
        <div>
          <p className="protected-kicker">Lia Clinic workspace</p>
          <h1>{getRoleLabel(session.principal.role)} command center</h1>
        </div>

        <div className="protected-session-card">
          <div>
            <strong>{session.principal.email}</strong>
            <span>{session.principal.tenantId}</span>
          </div>

          <button
            className="protected-logout"
            disabled={isLoggingOut}
            onClick={handleLogout}
            type="button"
          >
            <LogOut aria-hidden="true" size={16} />
            <span>{isLoggingOut ? "Signing out..." : "Logout"}</span>
          </button>
        </div>
      </header>

      <main className="protected-main">{children}</main>
    </div>
  );
}
