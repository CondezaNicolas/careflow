import type { ReactNode } from "react";

import { ProtectedLayout } from "@/features/auth/components/protected-layout";

interface ProtectedRouteGroupLayoutProps {
  children: ReactNode;
}

export default function ProtectedRouteGroupLayout({ children }: ProtectedRouteGroupLayoutProps) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
