import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { AUDIT_ACTION } from "../audit/audit.types.js";
import { PlatformConfigService } from "../config/platform-config.service.js";
import { OpsService } from "./ops.service.js";

const ADMIN_PRINCIPAL = {
  id: "usr-admin",
  tenantId: "tenant-1",
  role: "admin",
  email: "admin@lia.local"
} as const;

describe("OpsService", () => {
  let auditEvents: Array<{
    action: string;
    metadata: Record<string, unknown>;
  }>;

  function createOpsService(overrides?: {
    query?: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
    requestLoggingEnabled?: boolean;
    devBypassEnabled?: boolean;
    devLoginEnabled?: boolean;
  }) {
    const mockDb = {
      query: async (sql: string) => {
        if (overrides?.query) {
          return overrides.query(sql);
        }

        if (sql.includes("current_database()")) {
          return {
            rows: [
              {
                database_name: "lia_clinic",
                database_now: new Date("2026-03-20T12:00:00.000Z")
              }
            ]
          };
        }

        return { rows: [] };
      }
    } as unknown as import("../db/database.service.js").DatabaseService;

    const mockPlatformConfig = {
      runtime: {
        nodeEnv: "development",
        mode: "local"
      },
      server: {
        apiPort: 3001,
        allowedOrigins: ["http://localhost:3310", "http://localhost:3000"],
        requestLoggingEnabled: overrides?.requestLoggingEnabled ?? true,
        requestTimeoutMs: 30_000,
        shutdownGracePeriodMs: 10_000
      },
      auth: {
        devBypassEnabled: overrides?.devBypassEnabled ?? false,
        devLoginEnabled: overrides?.devLoginEnabled ?? false
      },
      ops: {
        productionPreflightRequired: false
      },
      database: {
        url: "postgresql://lia:lia@localhost:5432/lia_clinic"
      },
      raw: {}
    } as unknown as PlatformConfigService;

    const auditRepository = {
      saveDomainEvent: async (event: { action: string; metadata: Record<string, unknown> }) => {
        auditEvents.push(event);
      }
    } as unknown as import("../audit/audit.repository.js").AuditRepository;

    return new OpsService(mockDb, mockPlatformConfig, auditRepository);
  }

  beforeEach(() => {
    auditEvents = [];
  });

  describe("getLiveness", () => {
    it("returns ok status with service name and timestamp", () => {
      const opsService = createOpsService();
      const result = opsService.getLiveness();

      assert.equal(result.status, "ok");
      assert.equal(result.service, "lia-clinic-core-api");
      assert.ok(typeof result.generatedAtIso === "string");
      assert.ok(result.generatedAtIso.endsWith("Z"));
    });
  });

  describe("getReadiness", () => {
    it("includes configuration diagnostics alongside dependency checks", async () => {
      const opsService = createOpsService({
        requestLoggingEnabled: false,
        devBypassEnabled: true,
        devLoginEnabled: true
      });

      const result = await opsService.getReadiness();

      assert.equal(result.status, "ready");
      assert.equal(result.checks.database.status, "ok");
      assert.equal(result.checks.config.status, "warning");
      assert.equal(result.checks.config.requestLoggingEnabled, false);
      assert.equal(result.checks.config.shutdownGracePeriodMs, 10_000);
      assert.equal(result.checks.config.allowedOriginsCount, 2);
      assert.equal(result.checks.config.warnings.length, 3);
    });
  });

  describe("getApiMetrics", () => {
    it("returns metrics snapshot and audits admin access", async () => {
      const opsService = createOpsService();
      const result = await opsService.getApiMetrics(ADMIN_PRINCIPAL);

      assert.equal(typeof result.generatedAtIso, "string");
      assert.ok(typeof result.http === "object");
      assert.equal(auditEvents[0]?.action, AUDIT_ACTION.OPS_METRICS_VIEWED);
    });
  });

  describe("getOutboxHealth", () => {
    it("returns outbox health structure with required fields", async () => {
      const opsService = createOpsService({
        query: async (sql: string) => {
          if (sql.includes("GROUP BY event_type")) {
            return {
              rows: [
                {
                  event_type: "appointment.created",
                  pending_count: "2"
                }
              ]
            };
          }

          if (sql.includes("FROM outbox_events") && sql.includes("pending_count")) {
            return {
              rows: [
                {
                  pending_count: "2",
                  processed_count: "5",
                  failed_count: "1",
                  dead_letters_24h: "0",
                  oldest_pending_created_at: new Date("2026-03-20T11:00:00.000Z"),
                  pending_with_retries: "1"
                }
              ]
            };
          }

          return { rows: [] };
        }
      });

      const result = await opsService.getOutboxHealth(ADMIN_PRINCIPAL);

      assert.ok(typeof result.generatedAtIso === "string");
      assert.equal(result.totals.pending, 2);
      assert.equal(result.retryBacklog.pendingWithRetries, 1);
      assert.equal(result.pendingByEventType[0]?.eventType, "appointment.created");
      assert.equal(auditEvents[0]?.action, AUDIT_ACTION.OPS_OUTBOX_HEALTH_VIEWED);
    });
  });

  describe("getReleaseDiagnostics", () => {
    it("returns runtime hardening details and audits diagnostics access", async () => {
      const opsService = createOpsService();
      const result = await opsService.getReleaseDiagnostics(ADMIN_PRINCIPAL);

      assert.equal(result.env.requestTimeoutMs, 30_000);
      assert.equal(result.env.shutdownGracePeriodMs, 10_000);
      assert.equal(result.env.allowedOriginsCount, 2);
      assert.equal(result.readiness.checks.config.status, "ok");
      assert.equal(auditEvents[0]?.action, AUDIT_ACTION.OPS_DIAGNOSTICS_VIEWED);
    });
  });
});
