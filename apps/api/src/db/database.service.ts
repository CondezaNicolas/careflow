import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { PlatformConfigService } from "../config/platform-config.service.js";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(PlatformConfigService) platformConfig: PlatformConfigService) {
    this.pool = new Pool({ connectionString: platformConfig.database.url });
  }

  query<T extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, [...values]);
  }

  async transaction<T>(
    action: (transaction: DatabaseTransaction) => Promise<T>,
    options: DatabaseTransactionOptions = {}
  ): Promise<T> {
    const client = await this.pool.connect();
    const isolationLevel = options.isolationLevel ?? "SERIALIZABLE";
    const transaction = new DatabaseTransaction(client);

    try {
      await client.query("BEGIN");
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
      const result = await action(transaction);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.destroy();
  }

  async destroy(): Promise<void> {
    await this.pool.end();
  }
}

export class DatabaseTransaction {
  constructor(private readonly client: PoolClient) {}

  query<T extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<T>> {
    return this.client.query<T>(text, [...values]);
  }
}

interface DatabaseTransactionOptions {
  isolationLevel?: "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";
}
