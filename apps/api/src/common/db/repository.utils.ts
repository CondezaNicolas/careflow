import { DatabaseService, type DatabaseTransaction } from "../../db/database.service.js";

export type QueryExecutor = DatabaseService | DatabaseTransaction;

export function resolveQueryExecutor(
  databaseService: DatabaseService,
  transaction?: DatabaseTransaction
): QueryExecutor {
  return transaction ?? databaseService;
}

export function inSerializableTransaction<T>(
  databaseService: DatabaseService,
  action: (transaction: DatabaseTransaction) => Promise<T>
): Promise<T> {
  return databaseService.transaction(action, { isolationLevel: "SERIALIZABLE" });
}

export function mapOptionalRow<TRow, TValue>(
  row: TRow | undefined,
  mapper: (value: TRow) => TValue
): TValue | null {
  return row ? mapper(row) : null;
}
