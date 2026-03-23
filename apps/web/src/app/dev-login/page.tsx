"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { DevLoginPanel } from "@/features/auth/components/dev-login-panel";
import type { UserRole } from "@/features/auth/auth.types";
import {
  useAuthActions,
  useAuthEvent,
  useAuthReady,
  useAuthSession
} from "@/features/auth/hooks/use-auth";
import {
  createSingleFlightRunner,
  getLoginErrorMessage,
  LOGIN_SUBMISSION,
  type LoginSubmission,
  submitDevRoleLogin
} from "@/features/auth/login/login-flow";
import { getAuthEventMessage } from "@/features/auth/routing/protected-route";
import { getRoleLandingRoute } from "@/lib/auth/role-routes";
import { env } from "@/lib/env";
import { APP_ROUTE } from "@/lib/routes";

export default function DevLoginPage() {
  const router = useRouter();
  const isReady = useAuthReady();
  const session = useAuthSession();
  const authEvent = useAuthEvent();
  const { clearError, clearEvent, devLogin } = useAuthActions();
  const submissionRunnerRef = useRef(createSingleFlightRunner());
  const [activeSubmission, setActiveSubmission] = useState<LoginSubmission | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !session) {
      return;
    }

    router.replace(getRoleLandingRoute(session.principal.role));
  }, [isReady, router, session]);

  async function handleDevRoleLogin(role: UserRole) {
    await submissionRunnerRef.current(async () => {
      clearError();
      clearEvent();
      setAuthError(null);
      setActiveSubmission(LOGIN_SUBMISSION.DEV_LOGIN);

      try {
        await submitDevRoleLogin(role, {
          devLogin,
          navigate: (href) => {
            router.replace(href);
          }
        });
      } catch (error) {
        setAuthError(getLoginErrorMessage(error));
      } finally {
        setActiveSubmission(null);
      }
    });
  }

  if (!isReady) {
    return null;
  }

  if (session) {
    return (
      <main className="shell">
        <section className="panel status-panel">
          <p className="eyebrow">Authenticated session</p>
          <h1>Redirecting you to your workspace...</h1>
          <p>
            You already have an active session, so the development shortcut stays out of your way.
          </p>
        </section>
      </main>
    );
  }

  const authEventMessage = getAuthEventMessage(authEvent);

  return (
    <main className="shell dev-login-route">
      <section className="panel dev-login-route__panel" aria-label="Development login page">
        <div className="dev-login-route__copy">
          <p className="eyebrow">Development only</p>
          <h1>Role shortcut sign-in</h1>
          <p>
            Use the existing role shortcuts here so the main login screen stays production-shaped.
          </p>
        </div>

        {authEventMessage ? <div className="login-notice">{authEventMessage}</div> : null}
        {authError ? <div className="login-error">{authError}</div> : null}

        <DevLoginPanel
          enabled={env.devLoginEnabled}
          isSubmitting={activeSubmission === LOGIN_SUBMISSION.DEV_LOGIN}
          onSelectRole={handleDevRoleLogin}
          showIntro={false}
        />

        <p className="login-footnote">
          Need the full production login?{" "}
          <Link href={APP_ROUTE.LOGIN}>Go back to the main sign-in page</Link>.
        </p>
      </section>
    </main>
  );
}
