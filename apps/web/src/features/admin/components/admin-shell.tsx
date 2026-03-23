"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useAuthActions, useAuthSession } from "@/features/auth/hooks/use-auth";
import { buildLoginRoute, LOGIN_REDIRECT_REASON } from "@/features/auth/routing/protected-route";
import { getRoleLabel } from "@/lib/auth/role-routes";

import { AdminHeader } from "./admin-header";
import { AdminSidebar } from "./admin-sidebar";

interface AdminShellProps {
  children: ReactNode;
}

function getDisplayName(email: string): string {
  const localPart = email.split("@")[0] ?? "admin operator";

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((token) => token[0]!.toUpperCase() + token.slice(1))
    .join(" ");
}

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAuthSession();
  const { logout } = useAuthActions();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [pathname]);

  if (!session) {
    return <>{children}</>;
  }

  const displayName = getDisplayName(session.principal.email);

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await logout();
      router.replace(buildLoginRoute(LOGIN_REDIRECT_REASON.SIGNED_OUT));
    } finally {
      setIsLoggingOut(false);
      setIsMobileSidebarOpen(false);
    }
  }

  return (
    <div className="admin-workspace" data-mobile-nav={isMobileSidebarOpen ? "open" : "closed"}>
      <div
        aria-hidden="true"
        className="admin-workspace__overlay"
        onClick={() => setIsMobileSidebarOpen(false)}
      />

      <div className="admin-workspace__sidebar-frame">
        <AdminSidebar
          displayName={displayName}
          isCollapsed={isSidebarCollapsed}
          isLoggingOut={isLoggingOut}
          onLogout={handleLogout}
          onToggleCollapse={() => setIsSidebarCollapsed((currentState) => !currentState)}
          roleLabel={getRoleLabel(session.principal.role)}
          tenantId={session.principal.tenantId}
        />
      </div>

      <div className="admin-workspace__main">
        <AdminHeader
          displayName={displayName}
          email={session.principal.email}
          isLoggingOut={isLoggingOut}
          isMobileSidebarOpen={isMobileSidebarOpen}
          onLogout={handleLogout}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen((currentState) => !currentState)}
          roleLabel={getRoleLabel(session.principal.role)}
          tenantId={session.principal.tenantId}
        />

        <main className="admin-workspace__content">{children}</main>
      </div>
    </div>
  );
}
