"use client";

import { Bell, ChevronDown, Plus, Search, ShieldCheck, Workflow } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Breadcrumb } from "./breadcrumb";

const STITCH_PROFILE_AVATAR_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBQHzYLBjqGUr3Ua--Q2TlzqRQmz0mm09wcyLU7bW7ImsZ5MMkJ6uNhW-jI6DJKg7wkw8ZSxJ4T7sknUzULUBK_F5jqyvVchNgDT9JvQMe0Oc1k1iBwxfE2YuRtEqxn5_jfPF-L9zw_uWcO4WI5r-kDVIz8v9IThFN-VbjGsK6skuoFiWIlad8_a5Pe6wRlz_mLgo9vEKltIIVviFNi5hLFjJb7gxKIehJHtNbjepvIQp_xzZvH4p1VMw0HOGHNZFDH76RzAaeEXgWO";

interface AdminHeaderProps {
  displayName: string;
  email: string;
  isLoggingOut: boolean;
  onLogout: () => void;
  roleLabel: string;
  tenantId: string;
}

const ADMIN_SYSTEM_STATUSES = ["API", "DB", "WORKER", "SYNC"] as const;

export function AdminHeader({
  displayName,
  email,
  isLoggingOut,
  onLogout,
  roleLabel,
  tenantId
}: AdminHeaderProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (profileMenuRef.current?.contains(event.target)) {
        return;
      }

      setIsProfileMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function handleLogoutClick() {
    setIsProfileMenuOpen(false);
    onLogout();
  }

  return (
    <header aria-label="Admin workspace header" className="admin-header" data-no-toggle="true">
      <div className="admin-header__utility-bar">
        <Breadcrumb />

        <div className="admin-header__utility-meta">
          <div aria-label="System status" className="admin-header__status-cluster">
            {ADMIN_SYSTEM_STATUSES.map((status) => (
              <div className="admin-header__status-item" key={status}>
                <span aria-hidden="true" className="admin-header__status-dot" />
                <span>{status}</span>
              </div>
            ))}
          </div>

          <span aria-hidden="true" className="admin-header__utility-divider" />

          <button className="admin-header__facility-switch" type="button">
            <Workflow aria-hidden="true" size={16} />
            <span>Sede Central (BSAS)</span>
            <ChevronDown aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      <div className="admin-header__primary">
        <div className="admin-header__primary-main">
          <div className="admin-header__title-block">
            <h1>Dashboard</h1>
            <label className="admin-header__search" htmlFor="admin-header-search">
              <Search aria-hidden="true" className="admin-header__search-icon" size={18} />
              <input
                id="admin-header-search"
                name="adminHeaderSearch"
                placeholder="Buscar usuarios, pacientes, turnos, logs..."
                type="search"
              />
            </label>
          </div>
        </div>

        <div className="admin-header__actions">
          <button className="admin-header__primary-action" type="button">
            <Plus aria-hidden="true" size={18} />
            Nuevo Usuario
          </button>

          <div aria-hidden="true" className="admin-header__action-divider" />

          <div className="admin-header__icon-actions">
            <button
              aria-label="Open notifications center"
              className="admin-header__icon-button admin-header__icon-button--has-dot"
              type="button"
            >
              <Bell aria-hidden="true" size={18} />
            </button>

            <button
              aria-label="Open security center"
              className="admin-header__icon-button admin-header__icon-button--security"
              type="button"
            >
              <ShieldCheck aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="admin-header__profile-shell" ref={profileMenuRef}>
            <button
              aria-expanded={isProfileMenuOpen}
              aria-label="Open profile menu"
              className="admin-header__profile-trigger"
              onClick={() => setIsProfileMenuOpen((currentState) => !currentState)}
              type="button"
            >
              <div className="admin-header__profile-copy">
                <strong>{displayName}</strong>
                <span>{roleLabel}</span>
              </div>

              <span aria-hidden="true" className="admin-header__profile-avatar">
                <img alt="Perfil de usuario" src={STITCH_PROFILE_AVATAR_URL} />
                <span className="admin-header__profile-presence" />
              </span>
            </button>

            <div
              className="admin-header__profile-menu"
              data-state={isProfileMenuOpen ? "open" : "closed"}
              role="menu"
            >
              <div className="admin-header__profile-card">
                <p className="admin-header__profile-label">Sesion activa</p>
                <strong>{displayName}</strong>
                <span>{email}</span>
                <span>
                  {roleLabel} - {tenantId}
                </span>
              </div>

              <button
                className="admin-header__profile-logout"
                disabled={isLoggingOut}
                onClick={handleLogoutClick}
                type="button"
              >
                {isLoggingOut ? "Signing out..." : "Logout"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="admin-header__separator" />
    </header>
  );
}
