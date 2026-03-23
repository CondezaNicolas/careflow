import type { ReactNode } from "react";

import { AdminShell } from "@/features/admin/components/admin-shell";

interface AdminRouteLayoutProps {
  children: ReactNode;
}

export default function AdminRouteLayout({ children }: AdminRouteLayoutProps) {
  return <AdminShell>{children}</AdminShell>;
}
