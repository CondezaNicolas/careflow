"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuthReady, useAuthSession } from "@/features/auth/hooks/use-auth";
import { getRoleLandingRoute } from "@/lib/auth/role-routes";
import { APP_ROUTE } from "@/lib/routes";

export default function HomePage() {
  const router = useRouter();
  const isReady = useAuthReady();
  const session = useAuthSession();

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!session) {
      router.replace(APP_ROUTE.LOGIN);
      return;
    }

    router.replace(getRoleLandingRoute(session.principal.role));
  }, [isReady, router, session]);

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Workspace bootstrap</p>
        <h1>Routing your clinic session...</h1>
        <p>The root route now behaves as an auth-aware entry point instead of a feature page.</p>
      </section>
    </main>
  );
}
