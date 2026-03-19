# LIA Clinic - Roadmap & Future Features

## Estado Actual
**Versión**: MVP 1.0 (Producción-ready)
**Backend**: ✅ Completado
**Frontend**: ✅ Completado

---

## Features Futuros (v2.0+)

### 1. Reporting & Analytics
- [ ] Dashboard de métricas para admins
- [ ] Reportes de ocupación por especialista
- [ ] Export a PDF/Excel de exámenes y turnos
- [ ] Analytics de tiempos de espera

### 2. Billing & Payments
- [ ] Integración con Payment Gateway (MercadoPago, Stripe)
- [ ] Facturación automática
- [ ] Planes de suscripción (prepago, pospago)
- [ ] Historial de pagos por paciente

### 3. Notificaciones Avanzadas
- [ ] Notificaciones push (FCM)
- [ ] SMS confirmations (Twilio)
- [ ] Plantillas de email personalizadas
- [ ] Recordatorios automáticos (24h, 2h antes)

### 4. Teleconsulta
- [ ] Video_llamada integración (Jitsi, Twilio Video)
- [ ] Waiting room virtual
- [ ] Grabación de consultas (con consentimiento)
- [ ] Chat en-vivo durante teleconsulta

### 5. Integraciones
- [ ] Webhooks para sistemas externos
- [ ] API GraphQL
- [ ] Integración con laboratorios (HL7/FHIR)
- [ ] Sincronización con calendarios (Google Calendar, Outlook)

### 6. Mejoras UX
- [ ] Modo offline (PWA)
- [ ] Tema dark/light
- [ ] Multi-idioma (i18n)
- [ ] Onboarding interactivo para pacientes

### 7. Seguridad Avanzada
- [ ] 2FA (TOTP)
- [ ] Audit log más detallado
- [ ] Rate limiting por tenant
- [ ] SSO/SAML para enterprises

### 8. Automatizaciones
- [ ] Workflow builder (visual)
- [ ] Auto-asignación de turnos
- [ ] Recordatorios personalizados por IA
- [ ] Escalamiento automático de turnos cancelados

---

## Stack Tecnológico Recomendado

### Backend Adicional
- **Database**: TimescaleDB (analytics), Redis (caching, rate limiting)
- **Search**: Meilisearch o Elasticsearch (búsqueda full-text)
- **Queue**: BullMQ (já más tener Redis)
- **Monitoring**: Sentry, Datadog, Grafana
- **Auth**: Auth.js (já tiene OIDC), agregar 2FA

### Frontend Adicional
- **Analytics**: Plausible o Google Analytics 4
- **Error Tracking**: Sentry
- **A/B Testing**: LaunchDarkly o Statsig
- **CMS**: Sanity o Contentful (para noticias/avisos)

### DevOps
- **CI/CD**: GitHub Actions + Railway o Render
- **CDN**: Cloudflare
- **Secrets**: Vault o Doppler
- **Container**: Docker + docker-compose

---

## Priorización Sugerida

| Prioridad | Feature | Razón |
|-----------|---------|-------|
| **P0** | Reporting & Analytics | Valor inmediato para admins |
| **P0** | Notificaciones SMS | Reduce no-shows 30% |
| **P1** | Billing | Revenue stream |
| **P1** | Teleconsulta | Diferenciador competitivo |
| **P2** | Integraciones | Para enterprises |
| **P2** | PWA offline | Mejor UX |
| **P3** | 2FA | Seguridad avanzada |

---

## Estimation

| Feature | Complexity | Estimated Time |
|---------|------------|----------------|
| Reporting | M | 2-3 sprints |
| Billing | L | 4-5 sprints |
| Notificaciones | M | 2 sprints |
| Teleconsulta | XL | 6-8 sprints |
| Integraciones | L | 4-5 sprints |
| PWA | M | 2 sprints |
| 2FA | S | 1 sprint |

**Total estimado**: 21-26 sprints (~10-13 meses)

---

*Documento generado: 2026-03-16*
*Proyecto: LIA Clinic MVP*
