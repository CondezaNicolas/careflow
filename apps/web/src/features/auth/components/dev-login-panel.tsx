import {
  ArrowRight,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  type LucideIcon
} from "lucide-react";

import type { UserRole } from "@/features/auth/auth.types";

const DEV_ROLE_OPTION = [
  {
    icon: ShieldCheck,
    role: "admin",
    label: "Admin",
    description: "Operations, audit, and platform oversight."
  },
  {
    icon: Stethoscope,
    role: "clinician",
    label: "Clinician",
    description: "Daily care workflows and patient follow-up."
  },
  {
    icon: Users,
    role: "receptionist",
    label: "Receptionist",
    description: "Front desk scheduling and intake flows."
  },
  {
    icon: UserRound,
    role: "patient",
    label: "Patient",
    description: "Portal access and appointment visibility."
  }
] as const satisfies ReadonlyArray<{
  icon: LucideIcon;
  role: UserRole;
  label: string;
  description: string;
}>;

interface DevLoginPanelProps {
  enabled: boolean;
  isSubmitting: boolean;
  onSelectRole: (role: UserRole) => Promise<void>;
  showIntro?: boolean;
}

export function DevLoginPanel({
  enabled,
  isSubmitting,
  onSelectRole,
  showIntro = true
}: DevLoginPanelProps) {
  if (!enabled) {
    return (
      <div className="dev-login-note">
        <div className="dev-login-note__icon" aria-hidden="true">
          <ShieldCheck size={18} strokeWidth={2.1} />
        </div>
        <div>
          <strong>Dev shortcuts are off.</strong>
          <span>Keep `NEXT_PUBLIC_DEV_LOGIN_ENABLED=false` outside local testing.</span>
        </div>
      </div>
    );
  }

  return (
    <section className="dev-login-panel" aria-label="Development login shortcuts">
      {showIntro ? (
        <div className="dev-login-copy">
          <p className="eyebrow">Portal unificado</p>
          <h3>Acceso de desarrollo por rol</h3>
          <p>Usa estos atajos solo cuando el endpoint local de dev-login este habilitado.</p>
        </div>
      ) : null}

      <div className="dev-login-grid">
        {DEV_ROLE_OPTION.map((option) => (
          <button
            key={option.role}
            className="dev-login-card"
            disabled={isSubmitting}
            type="button"
            onClick={() => {
              void onSelectRole(option.role);
            }}
          >
            <span className="dev-login-card__icon" aria-hidden="true">
              <option.icon size={18} strokeWidth={2.1} />
            </span>
            <div className="dev-login-card__copy">
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </div>
            <span className="dev-login-card__arrow" aria-hidden="true">
              <ArrowRight size={16} strokeWidth={2.2} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
