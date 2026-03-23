"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  HelpCircle,
  History,
  Hospital,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
  UserRoundCog,
  Workflow
} from "lucide-react";
import Link from "next/link";
import type { MouseEvent } from "react";

interface AdminSidebarItem {
  href?: string;
  icon: LucideIcon;
  id: string;
  isActive?: boolean;
  label: string;
}

interface AdminSidebarProps {
  displayName: string;
  isCollapsed: boolean;
  isLoggingOut: boolean;
  onLogout: () => void;
  onToggleCollapse: () => void;
  roleLabel: string;
  tenantId: string;
}

const ADMIN_SIDEBAR_ITEMS: readonly AdminSidebarItem[] = [
  {
    href: "/admin",
    icon: LayoutDashboard,
    id: "dashboard",
    isActive: true,
    label: "Dashboard"
  },
  {
    icon: Activity,
    id: "operations",
    label: "Operaciones"
  },
  {
    icon: UserRoundCog,
    id: "users",
    label: "Usuarios y Roles"
  },
  {
    icon: Building2,
    id: "clinic",
    label: "Clinica"
  },
  {
    icon: Workflow,
    id: "integrations",
    label: "Integraciones"
  },
  {
    icon: History,
    id: "audit",
    label: "Auditoria"
  },
  {
    icon: Settings,
    id: "settings",
    label: "Configuracion"
  },
  {
    icon: HelpCircle,
    id: "support",
    label: "Soporte"
  }
] as const;

function buildInitials(displayName: string): string {
  const tokens = displayName
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (tokens.length === 0) {
    return "AD";
  }

  return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("");
}

function stopSidebarEventPropagation(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

export function AdminSidebar({
  displayName,
  isCollapsed,
  isLoggingOut,
  onLogout,
  onToggleCollapse,
  roleLabel,
  tenantId
}: AdminSidebarProps) {
  const initials = buildInitials(displayName);

  function handleSidebarClick(event: MouseEvent<HTMLElement>) {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest("a, button")) {
      return;
    }

    onToggleCollapse();
  }

  return (
    <aside
      aria-label="Admin navigation shell"
      className="admin-sidebar"
      data-sidebar-state={isCollapsed ? "collapsed" : "expanded"}
      onClick={handleSidebarClick}
    >
      <div className="admin-sidebar__brand">
        <div className="admin-sidebar__brand-mark" aria-hidden="true">
          <Hospital size={18} />
        </div>

        <div className="admin-sidebar__brand-copy" aria-hidden={isCollapsed}>
          <strong>CareFlow</strong>
          <span>Clinical Sanctuary</span>
        </div>
      </div>

      <nav aria-label="Admin sections" className="admin-sidebar__nav">
        {ADMIN_SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const itemClassName = item.isActive
            ? "admin-sidebar__item admin-sidebar__item--active"
            : "admin-sidebar__item";

          if (item.href) {
            return (
              <Link
                aria-label={item.label}
                className={itemClassName}
                href={item.href}
                key={item.id}
                onClick={stopSidebarEventPropagation}
              >
                <span className="admin-sidebar__item-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="admin-sidebar__item-label" aria-hidden={isCollapsed}>
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <button
              aria-label={item.label}
              className={itemClassName}
              key={item.id}
              onClick={stopSidebarEventPropagation}
              type="button"
            >
              <span className="admin-sidebar__item-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className="admin-sidebar__item-label" aria-hidden={isCollapsed}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="admin-sidebar__footer">
        <button
          aria-label="Cerrar sesion"
          className="admin-sidebar__logout"
          onClick={(event) => {
            event.stopPropagation();
            onLogout();
          }}
          type="button"
        >
          <span className="admin-sidebar__item-icon" aria-hidden="true">
            <LogOut size={18} />
          </span>
          <span className="admin-sidebar__item-label" aria-hidden={isCollapsed}>
            {isLoggingOut ? "Cerrando sesion..." : "Cerrar sesion"}
          </span>
        </button>

        <div className="admin-sidebar__profile" data-no-toggle="true">
          <div className="admin-sidebar__avatar" aria-hidden="true">
            <span>{initials}</span>
          </div>

          <div className="admin-sidebar__profile-copy" aria-hidden={isCollapsed}>
            <p>{displayName}</p>
            <span>
              {roleLabel} - {tenantId}
            </span>
          </div>

          <span className="admin-sidebar__profile-icon" aria-hidden="true">
            <Sparkles size={16} />
          </span>
        </div>
      </div>
    </aside>
  );
}
