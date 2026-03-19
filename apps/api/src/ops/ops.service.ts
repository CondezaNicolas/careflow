import { Inject, Injectable } from "@nestjs/common";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { getHttpMetricsSnapshot } from "../common/observability/api-metrics.js";
import { parseEnv } from "../config/env.js";
import { DatabaseService } from "../db/database.service.js";

export type ReadinessStatus = "ready" | "not_ready";
export type CheckStatus = "ok" | "error";
export type IntegrationReadinessStatus = "configured" | "missing_config";

export interface DatabaseReadinessCheck {
  status: CheckStatus;
  latencyMs: number | null;
  databaseName: string | null;
  databaseNowIso: string | null;
  error: string | null;
}

export interface IntegrationReadiness {
  integration: "oidc" | "google_calendar" | "email" | "whatsapp";
  requiredInCurrentEnv: boolean;
  status: IntegrationReadinessStatus;
  missingEnvKeys: string[];
}

export interface PreflightReadinessCheck {
  status: ReadinessStatus;
  requiredInCurrentEnv: boolean;
  integrations: IntegrationReadiness[];
}

const PREFLIGHT_INTEGRATION_KEYS = {
  oidc: ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI"],
  google_calendar: [
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REFRESH_TOKEN",
    "GOOGLE_CALENDAR_CALENDAR_ID"
  ],
  email: ["EMAIL_PROVIDER_API_KEY", "EMAIL_PROVIDER_FROM"],
  whatsapp: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID"]
} as const;

@Injectable()
export class OpsService {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  getLiveness(): { status: "ok"; service: string; generatedAtIso: string } {
    return {
      status: "ok",
      service: "lia-clinic-core-api",
      generatedAtIso: new Date().toISOString()
    };
  }

  async getReadiness(): Promise<{
    status: ReadinessStatus;
    generatedAtIso: string;
    checks: {
      database: DatabaseReadinessCheck;
      preflight: PreflightReadinessCheck;
    };
  }> {
    const generatedAtIso = new Date().toISOString();
    const startedAt = Date.now();
    const preflight = this.buildPreflightReadiness(process.env);

    try {
      const result = await this.databaseService.query<{ database_name: string; database_now: Date }>(
        "SELECT current_database() AS database_name, NOW() AS database_now"
      );
      const row = result.rows[0];

      const databaseCheck: DatabaseReadinessCheck = {
        status: "ok",
        latencyMs: Date.now() - startedAt,
        databaseName: row?.database_name ?? null,
        databaseNowIso: row?.database_now ? row.database_now.toISOString() : null,
        error: null
      };

      return {
        status: preflight.status === "ready" ? "ready" : "not_ready",
        generatedAtIso,
        checks: {
          database: databaseCheck,
          preflight
        }
      };
    } catch (error) {
      return {
        status: "not_ready",
        generatedAtIso,
        checks: {
          database: {
            status: "error",
            latencyMs: Date.now() - startedAt,
            databaseName: null,
            databaseNowIso: null,
            error: error instanceof Error ? error.message : "unknown_error"
          },
          preflight
        }
      };
    }
  }

  async getOutboxHealth(): Promise<{
    generatedAtIso: string;
    totals: {
      pending: number;
      processed: number;
      failed: number;
      deadLetters24h: number;
    };
    retryBacklog: {
      pendingWithRetries: number;
      oldestPendingCreatedAtIso: string | null;
    };
    pendingByEventType: Array<{ eventType: string; pendingCount: number }>;
  }> {
    const totalsRows = await this.databaseService.query<{
      pending_count: string;
      processed_count: string;
      failed_count: string;
      dead_letters_24h: string;
      oldest_pending_created_at: Date | null;
      pending_with_retries: string;
    }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::text AS pending_count,
          COUNT(*) FILTER (WHERE status = 'processed')::text AS processed_count,
          COUNT(*) FILTER (WHERE status = 'failed')::text AS failed_count,
          (
            SELECT COUNT(*)::text
            FROM outbox_dead_letters
            WHERE created_at >= NOW() - INTERVAL '24 hours'
          ) AS dead_letters_24h,
          MIN(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_created_at,
          (
            SELECT COUNT(*)::text
            FROM (
              SELECT outbox_event_id
              FROM job_attempts
              GROUP BY outbox_event_id
              HAVING MAX(attempt_number) > 0
            ) AS attempts
            INNER JOIN outbox_events AS outbox
              ON outbox.id = attempts.outbox_event_id
            WHERE outbox.status = 'pending'
          ) AS pending_with_retries
        FROM outbox_events
      `
    );

    const pendingByEventTypeRows = await this.databaseService.query<{ event_type: string; pending_count: string }>(
      `
        SELECT event_type, COUNT(*)::text AS pending_count
        FROM outbox_events
        WHERE status = 'pending'
        GROUP BY event_type
        ORDER BY COUNT(*) DESC, event_type ASC
      `
    );

    const totals = totalsRows.rows[0];
    return {
      generatedAtIso: new Date().toISOString(),
      totals: {
        pending: Number.parseInt(totals?.pending_count ?? "0", 10),
        processed: Number.parseInt(totals?.processed_count ?? "0", 10),
        failed: Number.parseInt(totals?.failed_count ?? "0", 10),
        deadLetters24h: Number.parseInt(totals?.dead_letters_24h ?? "0", 10)
      },
      retryBacklog: {
        pendingWithRetries: Number.parseInt(totals?.pending_with_retries ?? "0", 10),
        oldestPendingCreatedAtIso: totals?.oldest_pending_created_at?.toISOString() ?? null
      },
      pendingByEventType: pendingByEventTypeRows.rows.map((row) => ({
        eventType: row.event_type,
        pendingCount: Number.parseInt(row.pending_count, 10)
      }))
    };
  }

  getApiMetrics(): {
    generatedAtIso: string;
    http: ReturnType<typeof getHttpMetricsSnapshot>;
  } {
    return {
      generatedAtIso: new Date().toISOString(),
      http: getHttpMetricsSnapshot()
    };
  }

  async getReleaseDiagnostics(): Promise<{
    generatedAtIso: string;
    env: {
      nodeEnv: "development" | "test" | "production";
      apiPort: number;
      requestLoggingEnabled: boolean;
      oidcIssuerHost: string;
      oidcRedirectUriHost: string;
      sessionCookieName: string;
      sessionTtlMinutes: number;
      databaseUrlProtocol: string;
    };
    migrations: {
      directory: string;
      discoveredCount: number;
      firstFile: string | null;
      latestFile: string | null;
      expectedMinimum: number;
      status: "ok" | "warning";
    };
    readiness: {
      status: ReadinessStatus;
      checks: {
        database: DatabaseReadinessCheck;
        preflight: PreflightReadinessCheck;
      };
    };
    preflight: PreflightReadinessCheck;
  }> {
    const env = parseEnv(process.env);
    const migrationDirectory = resolve(process.cwd(), "src/db/migrations");
    const migrationFiles = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
    const readiness = await this.getReadiness();

    return {
      generatedAtIso: new Date().toISOString(),
      env: {
        nodeEnv: env.NODE_ENV,
        apiPort: env.API_PORT,
        requestLoggingEnabled: env.ENABLE_REQUEST_LOGGING,
        oidcIssuerHost: new URL(env.OIDC_ISSUER).host,
        oidcRedirectUriHost: new URL(env.OIDC_REDIRECT_URI).host,
        sessionCookieName: env.SESSION_COOKIE_NAME,
        sessionTtlMinutes: env.SESSION_TTL_MINUTES,
        databaseUrlProtocol: new URL(env.DATABASE_URL).protocol
      },
      migrations: {
        directory: migrationDirectory,
        discoveredCount: migrationFiles.length,
        firstFile: migrationFiles[0] ?? null,
        latestFile: migrationFiles.at(-1) ?? null,
        expectedMinimum: 12,
        status: migrationFiles.length >= 12 ? "ok" : "warning"
      },
      readiness: {
        status: readiness.status,
        checks: readiness.checks
      },
      preflight: readiness.checks.preflight
    };
  }

  private buildPreflightReadiness(source: NodeJS.ProcessEnv): PreflightReadinessCheck {
    const nodeEnv = source.NODE_ENV ?? "development";
    const productionLikeEnv = nodeEnv === "production";

    const integrations: IntegrationReadiness[] = [
      this.buildIntegrationReadiness("oidc", PREFLIGHT_INTEGRATION_KEYS.oidc, true, source),
      this.buildIntegrationReadiness("google_calendar", PREFLIGHT_INTEGRATION_KEYS.google_calendar, productionLikeEnv, source),
      this.buildIntegrationReadiness("email", PREFLIGHT_INTEGRATION_KEYS.email, productionLikeEnv, source),
      this.buildIntegrationReadiness("whatsapp", PREFLIGHT_INTEGRATION_KEYS.whatsapp, productionLikeEnv, source)
    ];

    const hasBlockingMissingConfig = integrations.some(
      (integration) => integration.requiredInCurrentEnv && integration.status === "missing_config"
    );

    return {
      status: hasBlockingMissingConfig ? "not_ready" : "ready",
      requiredInCurrentEnv: productionLikeEnv,
      integrations
    };
  }

  private buildIntegrationReadiness(
    integration: IntegrationReadiness["integration"],
    keys: readonly string[],
    requiredInCurrentEnv: boolean,
    source: NodeJS.ProcessEnv
  ): IntegrationReadiness {
    const missingEnvKeys = keys.filter((key) => !source[key] || source[key]?.trim().length === 0);
    return {
      integration,
      requiredInCurrentEnv,
      status: missingEnvKeys.length === 0 ? "configured" : "missing_config",
      missingEnvKeys
    };
  }
}
