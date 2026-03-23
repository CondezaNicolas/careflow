import type { UserRole } from "@/features/auth/auth.types";
import { getRoleLabel } from "@/lib/auth/role-routes";

interface RoleLandingPageProps {
  description: string;
  headline: string;
  highlights: string[];
  role: UserRole;
}

export function RoleLandingPage({ description, headline, highlights, role }: RoleLandingPageProps) {
  return (
    <section className="workspace-shell">
      <article className="workspace-card">
        <p className="eyebrow">{getRoleLabel(role)}</p>
        <h2>{headline}</h2>
        <p>{description}</p>

        <div className="workspace-chip-grid">
          {highlights.map((highlight) => (
            <span className="workspace-chip" key={highlight}>
              {highlight}
            </span>
          ))}
        </div>
      </article>
    </section>
  );
}
