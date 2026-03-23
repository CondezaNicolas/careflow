const HERO_STATS = [
  {
    label: "Consultas Diarias",
    value: "12k+"
  },
  {
    label: "Disponibilidad del Sistema",
    value: "99.9%"
  }
] as const;

const HERO_PREVIEW_IMAGE = [
  {
    alt: "Retrato de un profesional medico amable",
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuACGMAyFmhoTvGcIqsgyi4MqkpcL4NgFdvqOwYe43_SW457WJmlCUOychNLXvBnpUUPGmeYUmpmHJo-2L31P1qsJ4OzJoXvwnXBvep4OcMEPdEU4KQ3uD-kgzbg_F_zftK1z_6RFAt7Hwb-m_pqH6sX8-9jfbWEnb8znZwOy7SmE8wCzN7ssgcUXTr6Lr-ypf4C1AM2h6THw9tv5e4elP4lOLhCeApS70BkpegW6_LhuIK-JpnFjtgy6hvDAVX2UG9zEbycAVTLmVZu"
  },
  {
    alt: "Primer plano de equipo de tecnologia medica",
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCt6QBY2t2TVb1lRxLQu-z0FioOsl1eJW1uYJBxlmJSBzs3ksMlAaRHHa7v70SRd4qxUtwQGLJ6Stgpqb1EU465oCM4K784KSXpDWMLU5Bok_C9j-KPUVbvGV-A1PVj33Sypsa1DEGlovsknHr0XfrkgI3jZybL5FtSyD7mzbSOPDLM1CZlm_VtbW6FWW8r_mHjbEAKUlUr2jpPgR7EiBL0LQD6bHKWIx0bFQT_DaBuGbfxuPc-txUyqfhpjtxv5GGhgynDW-ltoKcr"
  }
] as const;

export function LoginHero() {
  return (
    <section className="login-hero" aria-label="Clinic login overview">
      <div className="login-hero-image" aria-hidden="true" />
      <div className="login-hero-overlay" aria-hidden="true" />

      <div className="login-hero-copy">
        <p className="login-hero-badge">ESTABLECIDO 2026</p>
        <h1>
          Tu portal hacia la <span>Excelencia Clinica</span>.
        </h1>
        <p className="login-lead">
          Bienvenido a CareFlow. Inicia sesion para gestionar expedientes, optimizar flujos de
          trabajo y brindar atencion de clase mundial.
        </p>
      </div>

      <div className="login-metric-grid" aria-label="Authentication overview highlights">
        {HERO_STATS.map((metric, index) => {
          return (
            <article key={metric.label} className="login-metric-card">
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
              {index === 0 ? <i className="login-metric-divider" aria-hidden="true" /> : null}
            </article>
          );
        })}
      </div>

      <div className="login-hero-gallery" aria-hidden="true">
        {HERO_PREVIEW_IMAGE.map((image, index) => (
          <div
            key={image.alt}
            className={`login-hero-gallery-card ${index === 1 ? "login-hero-gallery-card--offset" : ""}`}
          >
            <img alt={image.alt} src={image.src} />
          </div>
        ))}
      </div>
    </section>
  );
}
