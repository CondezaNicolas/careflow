import type { ReactNode } from "react";

interface LoginShellProps {
  children: ReactNode;
  footer: ReactNode;
  hero: ReactNode;
}

export function LoginShell({ children, footer, hero }: LoginShellProps) {
  return (
    <div className="login-experience">
      <main className="login-shell">
        {hero}

        <section className="login-panel" aria-label="Login panel">
          {children}
        </section>
      </main>

      <footer className="login-footer">{footer}</footer>
    </div>
  );
}
