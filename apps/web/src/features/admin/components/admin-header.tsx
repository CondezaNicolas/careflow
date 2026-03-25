"use client";

import { Bell, ChevronDown, Plus, Search, ShieldCheck, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Breadcrumb } from "./breadcrumb";
import { SearchResultsDropdown } from "./search-results-dropdown";
import { CreateUserModal } from "./create-user-modal";
import { useAdminTenants, useAdminSearch, useCreateUser, useSystemHealth } from "../hooks";

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

type SearchEntityType = "user" | "patient" | "appointment" | "log";

export function AdminHeader({
  displayName,
  email,
  isLoggingOut,
  onLogout,
  roleLabel,
  tenantId
}: AdminHeaderProps) {
  const router = useRouter();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [isSearchResultsVisible, setIsSearchResultsVisible] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const tenantDropdownRef = useRef<HTMLDivElement | null>(null);

  // Admin hooks
  const { data: tenants, isLoading: tenantsLoading } = useAdminTenants();
  const { data: searchResults, isLoading: searchLoading } = useAdminSearch(searchQuery);
  const createUserMutation = useCreateUser();
  const healthStatus = useSystemHealth();

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (profileMenuRef.current?.contains(event.target)) {
        return;
      }

      if (tenantDropdownRef.current?.contains(event.target)) {
        return;
      }

      setIsProfileMenuOpen(false);
      setIsTenantDropdownOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
        setIsTenantDropdownOpen(false);
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

  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setSearchQuery(value);
    setIsSearchResultsVisible(value.length >= 2);
  }

  function handleSearchSelect(entityType: SearchEntityType, entityId: string) {
    setIsSearchResultsVisible(false);
    setSearchQuery("");

    switch (entityType) {
      case "user":
        router.push(`/admin/users/${entityId}`);
        break;
      case "patient":
        router.push(`/admin/patients/${entityId}`);
        break;
      case "appointment":
        router.push(`/admin/appointments/${entityId}`);
        break;
      case "log":
        router.push("/admin/audit");
        break;
      default:
        console.warn(`Unknown search result type: ${entityType}`);
    }
  }

  function handleOpenCreateUserModal() {
    setIsCreateUserModalOpen(true);
  }

  function handleCloseCreateUserModal() {
    setIsCreateUserModalOpen(false);
  }

  async function handleCreateUser(data: {
    email: string;
    password: string;
    role: string;
    tenantId: string;
  }) {
    try {
      await createUserMutation.mutateAsync(data);
      setIsCreateUserModalOpen(false);
      alert("Usuario creado exitosamente");
    } catch (error) {
      console.error("Failed to create user:", error);
      alert("Error al crear usuario: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  function handleTenantClick() {
    setIsTenantDropdownOpen((prev) => !prev);
  }

  function handleTenantSwitch(tenantId: string) {
    setIsTenantDropdownOpen(false);
    // TODO: Implement actual tenant switching logic
    console.log("Switching to tenant:", tenantId);
    // This would typically update the auth context or refresh the page
  }

  return (
    <header aria-label="Admin workspace header" className="admin-header" data-no-toggle="true">
      <div className="admin-header__utility-bar">
        <Breadcrumb />

        <div className="admin-header__utility-meta">
          <div aria-label="System status" className="admin-header__status-cluster">
            <div
              className={`admin-header__status-item admin-header__status-item--${healthStatus.api}`}
            >
              <span aria-hidden="true" className="admin-header__status-dot" />
              <span>API</span>
            </div>
            <div
              className={`admin-header__status-item admin-header__status-item--${healthStatus.db}`}
            >
              <span aria-hidden="true" className="admin-header__status-dot" />
              <span>DB</span>
            </div>
          </div>

          <span aria-hidden="true" className="admin-header__utility-divider" />

          <div className="admin-header__tenant-switcher" ref={tenantDropdownRef}>
            <button
              className="admin-header__facility-switch"
              disabled={tenantsLoading}
              onClick={handleTenantClick}
              type="button"
              aria-expanded={isTenantDropdownOpen}
              aria-label="Change tenant"
            >
              <Workflow aria-hidden="true" size={16} />
              {tenantsLoading ? (
                <span>Cargando...</span>
              ) : tenants && tenants.length > 0 ? (
                <span>{tenants.find((t) => t.id === tenantId)?.name || "Seleccionar sede"}</span>
              ) : (
                <span>No hay sedes disponibles</span>
              )}
              <ChevronDown aria-hidden="true" size={16} />
            </button>

            {isTenantDropdownOpen && (
              <div className="admin-header__tenant-dropdown" role="menu">
                {tenants?.map((tenant) => (
                  <button
                    key={tenant.id}
                    onClick={() => handleTenantSwitch(tenant.id)}
                    className={
                      tenant.id === tenantId
                        ? "admin-header__tenant-dropdown-item admin-header__tenant-dropdown-item--selected"
                        : "admin-header__tenant-dropdown-item"
                    }
                    role="menuitem"
                    type="button"
                  >
                    {tenant.name}
                  </button>
                ))}
              </div>
            )}
          </div>
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
                value={searchQuery}
                onChange={handleSearchChange}
              />
              <SearchResultsDropdown
                loading={searchLoading}
                onSelect={handleSearchSelect}
                results={searchResults}
                visible={isSearchResultsVisible}
              />
            </label>
          </div>
        </div>

        <div className="admin-header__actions">
          <button
            className="admin-header__primary-action"
            onClick={handleOpenCreateUserModal}
            type="button"
          >
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

      <CreateUserModal
        isOpen={isCreateUserModalOpen}
        onClose={handleCloseCreateUserModal}
        onSubmit={handleCreateUser}
        tenants={tenants || []}
      />
    </header>
  );
}
