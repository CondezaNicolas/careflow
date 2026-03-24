"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const session = useAuthSession();
  const { logout } = useAuthActions();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Initialize sidebar state: collapsed on mobile, preserve state on desktop
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      // On mobile, always start collapsed
      return true;
    }

    // On desktop, check localStorage for saved preference
    const savedState = localStorage.getItem("admin-sidebar-collapsed");
    return savedState === "true";
  });

  // Persist sidebar state to localStorage on desktop only
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const isDesktop = window.innerWidth >= 768;
    if (isDesktop) {
      localStorage.setItem("admin-sidebar-collapsed", String(isSidebarCollapsed));
    }
  }, [isSidebarCollapsed]);

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
    }
  }

  function handleToggleSidebar() {
    setIsSidebarCollapsed((currentState) => !currentState);
  }

  return (
    <div className="admin-workspace">
      <div className="admin-workspace__sidebar-frame">
        <AdminSidebar
          displayName={displayName}
          isCollapsed={isSidebarCollapsed}
          isLoggingOut={isLoggingOut}
          onLogout={handleLogout}
          onToggleCollapse={handleToggleSidebar}
          roleLabel={getRoleLabel(session.principal.role)}
          tenantId={session.principal.tenantId}
        />
      </div>

      <div className="admin-workspace__main">
        <AdminHeader
          displayName={displayName}
          email={session.principal.email}
          isLoggingOut={isLoggingOut}
          onLogout={handleLogout}
          roleLabel={getRoleLabel(session.principal.role)}
          tenantId={session.principal.tenantId}
        />

        <main className="admin-workspace__content">{children}</main>
      </div>
    </div>
  );
}
