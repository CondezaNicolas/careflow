import { Inject, Injectable } from "@nestjs/common";

import { resolveQueryExecutor, type QueryExecutor } from "../common/db/repository.utils.js";
import { DatabaseService, type DatabaseTransaction } from "../db/database.service.js";
import type { AssistantAuditRecord } from "./assistant.types.js";

@Injectable()
export class AssistantRepository {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async saveAuditRecord(
    record: AssistantAuditRecord,
    transaction?: DatabaseTransaction
  ): Promise<void> {
    await this.getExecutor(transaction).query(
      `
        INSERT INTO assistant_tool_audit_logs (
          id,
          tenant_id,
          actor_id,
          actor_role,
          tool_name,
          is_write_action,
          confirmation_required,
          confirmation_provided,
          confirmation_token,
          outcome,
          request_json,
          response_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
      `,
      [
        record.id,
        record.tenantId,
        record.actorId,
        record.actorRole,
        record.toolName,
        record.isWriteAction,
        record.confirmationRequired,
        record.confirmationProvided,
        record.confirmationToken,
        record.outcome,
        JSON.stringify(record.request),
        JSON.stringify(record.response)
      ]
    );
  }

  private getExecutor(transaction?: DatabaseTransaction): QueryExecutor {
    return resolveQueryExecutor(this.databaseService, transaction);
  }
}
