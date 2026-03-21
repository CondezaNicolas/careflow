import { pathToFileURL } from "node:url";

import { InvalidWorkerEnvironmentError } from "./env.js";
import { runWorkerProcess } from "./runtime.js";
import { logStructured, normalizeErrorMessage } from "./worker.js";

export {
  GoogleCalendarOutboxWorker,
  NotificationOutboxWorker,
  RetryableNotificationError,
  RetryableSyncError,
  getWorkerMetricsSnapshot,
  resetWorkerMetricsSnapshot
} from "./worker.js";

const isEntrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

export async function startWorkerMain(): Promise<void> {
  await runWorkerProcess({ signalTarget: process });
}

if (isEntrypoint && process.env.NODE_ENV !== "test") {
  void startWorkerMain().catch((error: unknown) => {
    if (error instanceof InvalidWorkerEnvironmentError) {
      logStructured("worker.startup.invalid_environment", {
        issues: error.issues
      });
      process.exit(1);
    }

    logStructured("worker.startup.failed", {
      error: normalizeErrorMessage(error)
    });
    process.exit(1);
  });
}
