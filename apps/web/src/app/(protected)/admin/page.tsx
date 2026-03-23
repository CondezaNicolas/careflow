const ADMIN_METRIC_ITEMS = [
  {
    label: "Active tenants",
    value: "12"
  },
  {
    label: "Role policies checked",
    value: "28"
  },
  {
    label: "Audit alerts cleared",
    value: "04"
  }
] as const;

const ADMIN_FOCUS_ITEMS = [
  "Admin-only route protection is active across the workspace shell.",
  "Logout continues to return cleanly to the login flow.",
  "Role mismatches still bounce back to the correct landing route."
] as const;

const ADMIN_QUEUE_ITEMS = [
  "Review pending tenant onboarding before publishing new access bundles.",
  "Validate role mappings for newly invited staff members.",
  "Confirm audit exports and integration health before the next release window."
] as const;

export default function AdminPage() {
  return (
    <section className="admin-dashboard">
      <article className="admin-dashboard__hero">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Operational overview for this morning</h2>
          <p>
            Start with the critical tenant, role, and audit checkpoints while the broader clinic
            operations surface continues to take shape.
          </p>
        </div>

        <div className="admin-dashboard__metric-grid" aria-label="Admin overview metrics">
          {ADMIN_METRIC_ITEMS.map((metric) => (
            <article className="admin-dashboard__metric" key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </div>
      </article>

      <div className="admin-dashboard__grid">
        <article className="admin-dashboard__card">
          <p className="admin-dashboard__card-kicker">Focus now</p>
          <ul>
            {ADMIN_FOCUS_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="admin-dashboard__card admin-dashboard__card--accent">
          <p className="admin-dashboard__card-kicker">Operational queue</p>
          <ul>
            {ADMIN_QUEUE_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
