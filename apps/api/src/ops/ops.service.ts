import { Inject, Injectable } from "@nestjs/common";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import type { AuthPrincipal } from "@lia/shared-types";

import { AuditRepository } from "../audit/audit.repository.js";
import { AUDIT_ACTION, resolveMutationMeta } from "../audit/audit.types.js";
import { getHttpMetricsSnapshot } from "../common/observability/api-metrics.js";
import { PlatformConfigService } from "../config/platform-config.service.js";
import { DatabaseService } from "../db/database.service.js";

export type ReadinessStatus = "ready" | "not_ready";
export type CheckStatus = "ok" | "warning" | "error";
export type IntegrationReadinessStatus = "configured" | "missing_config";

export interface DatabaseReadinessCheck {
  status: CheckStatus;
  latencyMs: number | null;
  databaseName: string | null;
  databaseNowIso: string | null;
  error: string | null;
}

export interface IntegrationReadiness {
  integration: "google_calendar" | "email" | "whatsapp";
  requiredInCurrentEnv: boolean;
  status: IntegrationReadinessStatus;
  missingEnvKeys: string[];
}

export interface PreflightReadinessCheck {
  status: ReadinessStatus;
  requiredInCurrentEnv: boolean;
  integrations: IntegrationReadiness[];
}

export interface ConfigReadinessCheck {
  status: CheckStatus;
  requestLoggingEnabled: boolean;
  requestTimeoutMs: number;
  shutdownGracePeriodMs: number;
  authDevBypassEnabled: boolean;
  devLoginEnabled: boolean;
  allowedOriginsCount: number;
  warnings: string[];
}

const PREFLIGHT_INTEGRATION_KEYS = {
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
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(PlatformConfigService) private readonly platformConfig: PlatformConfigService,
    @Inject(AuditRepository) private readonly auditRepository: AuditRepository
  ) {}

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
      config: ConfigReadinessCheck;
    };
  }> {
    const generatedAtIso = new Date().toISOString();
    const startedAt = Date.now();
    const preflight = this.buildPreflightReadiness();
    const config = this.buildConfigReadiness();

    try {
      const result = await this.databaseService.query<{
        database_name: string;
        database_now: Date;
      }>("SELECT current_database() AS database_name, NOW() AS database_now");
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
          preflight,
          config
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
          preflight,
          config
        }
      };
    }
  }

  async getOutboxHealth(principal: AuthPrincipal): Promise<{
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

    const pendingByEventTypeRows = await this.databaseService.query<{
      event_type: string;
      pending_count: string;
    }>(
      `
        SELECT event_type, COUNT(*)::text AS pending_count
        FROM outbox_events
        WHERE status = 'pending'
        GROUP BY event_type
        ORDER BY COUNT(*) DESC, event_type ASC
      `
    );

    const totals = totalsRows.rows[0];
    const response = {
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

    await this.recordOpsAudit(
      principal,
      AUDIT_ACTION.OPS_OUTBOX_HEALTH_VIEWED,
      "ops/outbox/health",
      {
        pendingEvents: response.totals.pending,
        failedEvents: response.totals.failed,
        deadLetters24h: response.totals.deadLetters24h
      }
    );

    return response;
  }

  async getApiMetrics(principal: AuthPrincipal): Promise<{
    generatedAtIso: string;
    http: ReturnType<typeof getHttpMetricsSnapshot>;
  }> {
    const response = {
      generatedAtIso: new Date().toISOString(),
      http: getHttpMetricsSnapshot()
    };

    await this.recordOpsAudit(principal, AUDIT_ACTION.OPS_METRICS_VIEWED, "ops/metrics", {
      requestsTotal: response.http.requestsTotal,
      maxDurationMs: response.http.maxDurationMs
    });

    return response;
  }

  async getReleaseDiagnostics(principal: AuthPrincipal): Promise<{
    generatedAtIso: string;
    env: {
      nodeEnv: "development" | "test" | "production";
      runtimeMode: "local" | "test" | "production";
      apiPort: number;
      requestLoggingEnabled: boolean;
      requestTimeoutMs: number;
      shutdownGracePeriodMs: number;
      allowedOriginsCount: number;
      authDevBypassEnabled: boolean;
      devLoginEnabled: boolean;
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
        config: ConfigReadinessCheck;
      };
    };
    preflight: PreflightReadinessCheck;
  }> {
    const migrationDirectory = resolve(process.cwd(), "src/db/migrations");
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const readiness = await this.getReadiness();
    const migrationStatus: "ok" | "warning" = migrationFiles.length >= 12 ? "ok" : "warning";

    const response = {
      generatedAtIso: new Date().toISOString(),
      env: {
        nodeEnv: this.platformConfig.runtime.nodeEnv,
        runtimeMode: this.platformConfig.runtime.mode,
        apiPort: this.platformConfig.server.apiPort,
        requestLoggingEnabled: this.platformConfig.server.requestLoggingEnabled,
        requestTimeoutMs: this.platformConfig.server.requestTimeoutMs,
        shutdownGracePeriodMs: this.platformConfig.server.shutdownGracePeriodMs,
        allowedOriginsCount: this.platformConfig.server.allowedOrigins.length,
        authDevBypassEnabled: this.platformConfig.auth.devBypassEnabled,
        devLoginEnabled: this.platformConfig.auth.devLoginEnabled,
        databaseUrlProtocol: new URL(this.platformConfig.database.url).protocol
      },
      migrations: {
        directory: migrationDirectory,
        discoveredCount: migrationFiles.length,
        firstFile: migrationFiles[0] ?? null,
        latestFile: migrationFiles.at(-1) ?? null,
        expectedMinimum: 12,
        status: migrationStatus
      },
      readiness: {
        status: readiness.status,
        checks: readiness.checks
      },
      preflight: readiness.checks.preflight
    };

    await this.recordOpsAudit(principal, AUDIT_ACTION.OPS_DIAGNOSTICS_VIEWED, "ops/diagnostics", {
      readinessStatus: response.readiness.status,
      migrationStatus: response.migrations.status,
      preflightStatus: response.preflight.status
    });

    return response;
  }

  private buildConfigReadiness(): ConfigReadinessCheck {
    const warnings: string[] = [];

    if (!this.platformConfig.server.requestLoggingEnabled) {
      warnings.push("Request logging disabled reduces request-level observability");
    }

    if (this.platformConfig.auth.devBypassEnabled) {
      warnings.push("AUTH_DEV_BYPASS is enabled outside production");
    }

    if (this.platformConfig.auth.devLoginEnabled) {
      warnings.push("DEV_LOGIN_ENABLED is enabled outside production");
    }

    return {
      status: warnings.length > 0 ? "warning" : "ok",
      requestLoggingEnabled: this.platformConfig.server.requestLoggingEnabled,
      requestTimeoutMs: this.platformConfig.server.requestTimeoutMs,
      shutdownGracePeriodMs: this.platformConfig.server.shutdownGracePeriodMs,
      authDevBypassEnabled: this.platformConfig.auth.devBypassEnabled,
      devLoginEnabled: this.platformConfig.auth.devLoginEnabled,
      allowedOriginsCount: this.platformConfig.server.allowedOrigins.length,
      warnings
    };
  }

  private buildPreflightReadiness(): PreflightReadinessCheck {
    const requiredInCurrentEnv = this.platformConfig.ops.productionPreflightRequired;

    const integrations: IntegrationReadiness[] = [
      this.buildIntegrationReadiness(
        "google_calendar",
        PREFLIGHT_INTEGRATION_KEYS.google_calendar,
        requiredInCurrentEnv
      ),
      this.buildIntegrationReadiness(
        "email",
        PREFLIGHT_INTEGRATION_KEYS.email,
        requiredInCurrentEnv
      ),
      this.buildIntegrationReadiness(
        "whatsapp",
        PREFLIGHT_INTEGRATION_KEYS.whatsapp,
        requiredInCurrentEnv
      )
    ];

    const hasBlockingMissingConfig = integrations.some(
      (integration) => integration.requiredInCurrentEnv && integration.status === "missing_config"
    );

    return {
      status: hasBlockingMissingConfig ? "not_ready" : "ready",
      requiredInCurrentEnv,
      integrations
    };
  }

  private buildIntegrationReadiness(
    integration: IntegrationReadiness["integration"],
    keys: readonly string[],
    requiredInCurrentEnv: boolean
  ): IntegrationReadiness {
    const missingEnvKeys = keys.filter((key) => {
      const value = this.platformConfig.raw[key as keyof typeof this.platformConfig.raw];
      return typeof value !== "string" || value.trim().length === 0;
    });

    return {
      integration,
      requiredInCurrentEnv,
      status: missingEnvKeys.length === 0 ? "configured" : "missing_config",
      missingEnvKeys
    };
  }

  private async recordOpsAudit(
    principal: AuthPrincipal,
    action: (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION],
    entityId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const mutationMeta = resolveMutationMeta(undefined);

    await this.auditRepository.saveDomainEvent({
      id: randomUUID(),
      tenantId: principal.tenantId,
      actorId: principal.id,
      actorRole: principal.role,
      source: mutationMeta.source,
      action,
      entityType: "ops_endpoint",
      entityId,
      requestId: mutationMeta.requestId,
      traceId: mutationMeta.traceId,
      metadata
    });
  }
}
