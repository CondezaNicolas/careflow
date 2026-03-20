import { Inject, Injectable } from "@nestjs/common";

import { resolveQueryExecutor, type QueryExecutor } from "../common/db/repository.utils.js";
import { DatabaseService, type DatabaseTransaction } from "../db/database.service.js";
import type { DomainAuditEvent } from "./audit.types.js";

@Injectable()
export class AuditRepository {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async saveDomainEvent(event: DomainAuditEvent, transaction?: DatabaseTransaction): Promise<void> {
    await this.getExecutor(transaction).query(
      `
        INSERT INTO domain_audit_events (
          id,
          tenant_id,
          actor_id,
          actor_role,
          source,
          action,
          entity_type,
          entity_id,
          request_id,
          trace_id,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      `,
      [
        event.id,
        event.tenantId,
        event.actorId,
        event.actorRole,
        event.source,
        event.action,
        event.entityType,
        event.entityId,
        event.requestId,
        event.traceId,
        JSON.stringify(event.metadata)
      ]
    );
  }

  private getExecutor(transaction?: DatabaseTransaction): QueryExecutor {
    return resolveQueryExecutor(this.databaseService, transaction);
  }
}
