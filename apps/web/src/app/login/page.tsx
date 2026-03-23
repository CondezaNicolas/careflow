"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { LoginHero } from "@/features/auth/components/login-hero";
import { LoginForm } from "@/features/auth/components/login-form";
import { LoginShell } from "@/features/auth/components/login-shell";
import { loginInputSchema } from "@/features/auth/auth.schemas";
import type { LoginInput } from "@/features/auth/auth.types";
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
  submitCredentialLogin
} from "@/features/auth/login/login-flow";
import { getAuthEventMessage } from "@/features/auth/routing/protected-route";
import { getRoleLandingRoute } from "@/lib/auth/role-routes";

export default function LoginPage() {
  const router = useRouter();
  const isReady = useAuthReady();
  const session = useAuthSession();
  const authEvent = useAuthEvent();
  const { clearError, clearEvent, login } = useAuthActions();
  const submissionRunnerRef = useRef(createSingleFlightRunner());
  const [activeSubmission, setActiveSubmission] = useState<LoginSubmission | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  useEffect(() => {
    if (!isReady || !session) {
      return;
    }

    router.replace(getRoleLandingRoute(session.principal.role));
  }, [isReady, router, session]);

  async function runSubmission(kind: LoginSubmission, task: () => Promise<void>) {
    return submissionRunnerRef.current(async () => {
      clearError();
      clearEvent();
      setAuthError(null);
      setActiveSubmission(kind);

      try {
        await task();
      } catch (error) {
        setAuthError(getLoginErrorMessage(error));
      } finally {
        setActiveSubmission(null);
      }
    });
  }

  async function handleCredentialLogin(values: LoginInput) {
    await runSubmission(LOGIN_SUBMISSION.CREDENTIALS, async () => {
      await submitCredentialLogin(values, {
        login,
        navigate: (href) => {
          router.replace(href);
        }
      });
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
          <p>You already have an active session, so the login screen stays out of your way.</p>
        </section>
      </main>
    );
  }

  const isSubmitting = activeSubmission !== null;
  const authEventMessage = getAuthEventMessage(authEvent);

  return (
    <LoginShell
      footer={
        <>
          <div className="login-footer-copy">
            <span className="login-footer-brand">CareFlow</span>
            <p>© 2026 CareFlow. Todos los derechos reservados.</p>
          </div>

          <div className="login-footer-links" aria-label="Login footer links">
            <span>Politica de Privacidad</span>
            <span>Terminos de Servicio</span>
            <span>Centro de Ayuda</span>
          </div>
        </>
      }
      hero={<LoginHero />}
    >
      {authEventMessage ? <div className="login-notice">{authEventMessage}</div> : null}

      <LoginForm
        authError={authError}
        errors={form.formState.errors}
        isSubmitting={isSubmitting}
        onSubmit={form.handleSubmit(handleCredentialLogin)}
        register={form.register}
      />
    </LoginShell>
  );
}
