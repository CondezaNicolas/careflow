"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ROUTE_LABELS: Record<string, string> = {
  admin: "Dashboard",
  usuarios: "Usuarios y Roles",
  clinic: "Clinica",
  operations: "Operaciones",
  integrations: "Integraciones",
  audit: "Auditoria",
  settings: "Configuracion",
  support: "Soporte"
};

function buildBreadcrumbLabel(segment: string): string {
  if (ROUTE_LABELS[segment]) {
    return ROUTE_LABELS[segment];
  }
  return segment
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildHref(segments: string[], index: number): string {
  return "/" + segments.slice(0, index + 1).join("/");
}

interface BreadcrumbItem {
  label: string;
  href: string | null;
  isCurrent: boolean;
}

function buildBreadcrumbItems(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [{ label: "Dashboard", href: null, isCurrent: true }];
  }

  return segments.map((segment, index) => {
    const isCurrent = index === segments.length - 1;
    return {
      label: buildBreadcrumbLabel(segment),
      href: isCurrent ? null : buildHref(segments, index),
      isCurrent
    };
  });
}

export function Breadcrumb() {
  const pathname = usePathname();
  const items = buildBreadcrumbItems(pathname);

  return (
    <nav aria-label="Admin breadcrumb" className="admin-header__breadcrumbs">
      {items.map((item, index) => (
        <div className="admin-header__breadcrumb-item" key={item.label + item.href}>
          {index > 0 ? <ChevronRight aria-hidden="true" size={14} /> : null}
          {item.href ? (
            <Link className="admin-header__breadcrumb-link" href={item.href}>
              {item.label}
            </Link>
          ) : (
            <span className={item.isCurrent ? "admin-header__breadcrumb-current" : undefined}>
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
