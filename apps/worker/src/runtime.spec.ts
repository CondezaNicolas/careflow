import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WORKER_PROVIDER_MODE } from "./env.js";
import {
  WORKER_WAIT_OUTCOME,
  WORKER_SHUTDOWN_SIGNAL,
  createWorkerShutdownController,
  runWorkerLoop,
  type WorkerCycleResult,
  type WorkerRuntimeLoop
} from "./runtime.js";

describe("worker runtime loop", () => {
  it("repeats processing cycles until shutdown is requested", async () => {
    const shutdownController = createWorkerShutdownController({
      shutdownGracePeriodMs: 50
    });
    const logs = await captureStructuredLogs(async () => {
      let cycleCount = 0;
      let closeCount = 0;
      let waitCount = 0;

      const runtime = createTestRuntime({
        async runSingleCycle(runId) {
          cycleCount += 1;
          return createCycleResult(runId ?? `run-${cycleCount}`, {
            googleCalendar: { processed: 1, synced: 1, failed: 0, retried: 0 },
            notifications: { processed: 0, synced: 0, failed: 0, retried: 0 }
          });
        },
        async close() {
          closeCount += 1;
        }
      });

      await runWorkerLoop(runtime, {
        shutdownController,
        waitForNextCycle: async () => {
          waitCount += 1;
          if (waitCount === 1) {
            return WORKER_WAIT_OUTCOME.TIMEOUT;
          }

          shutdownController.requestShutdown(WORKER_SHUTDOWN_SIGNAL.SIGTERM);
          return WORKER_WAIT_OUTCOME.SHUTDOWN;
        }
      });

      assert.equal(cycleCount, 2);
      assert.equal(waitCount, 2);
      assert.equal(closeCount, 1);
    });

    assert.equal(findEvents(logs, "worker.cycle.started").length, 2);
    assert.equal(findEvents(logs, "worker.cycle.completed").length, 2);
    assert.equal(findEvents(logs, "worker.runtime.stopped").length, 1);
  });

  it("keeps idling without exiting when no work is due", async () => {
    const shutdownController = createWorkerShutdownController({
      shutdownGracePeriodMs: 50
    });
    const logs = await captureStructuredLogs(async () => {
      let cycleCount = 0;

      const runtime = createTestRuntime({
        async runSingleCycle(runId) {
          cycleCount += 1;
          return createCycleResult(runId ?? `idle-${cycleCount}`);
        }
      });

      await runWorkerLoop(runtime, {
        shutdownController,
        waitForNextCycle: async () => {
          if (cycleCount >= 2) {
            shutdownController.requestShutdown("test-idle-stop");
            return WORKER_WAIT_OUTCOME.SHUTDOWN;
          }

          return WORKER_WAIT_OUTCOME.TIMEOUT;
        }
      });

      assert.equal(cycleCount, 2);
    });

    assert.equal(findEvents(logs, "worker.cycle.idle").length, 2);
    assert.equal(
      findEvents(logs, "worker.cycle.completed").every((log) => log.idle === true),
      true
    );
  });

  it("logs resolved provider paths without exposing provider secrets", async () => {
    const shutdownController = createWorkerShutdownController({
      shutdownGracePeriodMs: 50
    });

    const logs = await captureStructuredLogs(async () => {
      await runWorkerLoop(createTestRuntime(), {
        shutdownController,
        waitForNextCycle: async () => {
          shutdownController.requestShutdown("log-once");
          return WORKER_WAIT_OUTCOME.SHUTDOWN;
        }
      });
    });

    const startupLog = findEvents(logs, "worker.runtime.started")[0];
    assert.ok(startupLog);
    assert.deepEqual(startupLog.providerResolution, {
      googleCalendar: {
        mode: "noop",
        provider: "noop",
        providerPath: "google_calendar.noop"
      },
      notifications: {
        email: {
          mode: "noop",
          provider: "noop",
          providerPath: "notifications.email.noop"
        },
        whatsapp: {
          mode: "noop",
          provider: "noop",
          providerPath: "notifications.whatsapp.noop"
        }
      }
    });
    assert.equal(JSON.stringify(startupLog).includes("token"), false);
    assert.equal(JSON.stringify(startupLog).includes("secret"), false);
  });

  it("waits for in-flight work to finish before shutting down", async () => {
    const shutdownController = createWorkerShutdownController({
      shutdownGracePeriodMs: 50
    });

    const lifecycle = {
      resolveCycle: undefined as (() => void) | undefined
    };
    let cycleStarted = false;
    let cycleCount = 0;
    let closeCount = 0;
    let waitCount = 0;

    const loopPromise = runWorkerLoop(
      createTestRuntime({
        async runSingleCycle(runId) {
          cycleStarted = true;
          cycleCount += 1;
          await new Promise<void>((resolve) => {
            lifecycle.resolveCycle = resolve;
          });
          return createCycleResult(runId ?? "graceful-shutdown");
        },
        async close() {
          closeCount += 1;
        }
      }),
      {
        shutdownController,
        waitForNextCycle: async () => {
          waitCount += 1;
          return WORKER_WAIT_OUTCOME.TIMEOUT;
        }
      }
    );

    await waitForCondition(() => cycleStarted);
    const firstShutdown = shutdownController.requestShutdown(WORKER_SHUTDOWN_SIGNAL.SIGINT);
    const secondShutdown = shutdownController.requestShutdown(WORKER_SHUTDOWN_SIGNAL.SIGTERM);
    if (!lifecycle.resolveCycle) {
      throw new Error("Expected in-flight cycle resolver to be available");
    }

    const cycleResolver = lifecycle.resolveCycle;
    cycleResolver();

    await loopPromise;

    assert.equal(firstShutdown, true);
    assert.equal(secondShutdown, false);
    assert.equal(cycleCount, 1);
    assert.equal(waitCount, 0);
    assert.equal(closeCount, 1);
  });
});

function createTestRuntime(overrides: Partial<WorkerRuntimeLoop> = {}): WorkerRuntimeLoop {
  return {
    config: {
      runtimeMode: "test",
      pollIntervalMs: 5,
      shutdownGracePeriodMs: 50,
      providerModes: {
        googleCalendar: WORKER_PROVIDER_MODE.NOOP,
        email: WORKER_PROVIDER_MODE.NOOP,
        whatsapp: WORKER_PROVIDER_MODE.NOOP
      }
    },
    providerResolution: {
      googleCalendar: {
        mode: WORKER_PROVIDER_MODE.NOOP,
        provider: "noop",
        providerPath: "google_calendar.noop"
      },
      notifications: {
        email: {
          mode: WORKER_PROVIDER_MODE.NOOP,
          provider: "noop",
          providerPath: "notifications.email.noop"
        },
        whatsapp: {
          mode: WORKER_PROVIDER_MODE.NOOP,
          provider: "noop",
          providerPath: "notifications.whatsapp.noop"
        }
      }
    },
    async runSingleCycle(runId) {
      return createCycleResult(runId ?? "test-run");
    },
    async close() {},
    ...overrides
  };
}

function createCycleResult(
  runId: string,
  overrides: Partial<Omit<WorkerCycleResult, "runId">> = {}
): WorkerCycleResult {
  return {
    runId,
    googleCalendar: overrides.googleCalendar ?? {
      processed: 0,
      synced: 0,
      failed: 0,
      retried: 0
    },
    notifications: overrides.notifications ?? {
      processed: 0,
      synced: 0,
      failed: 0,
      retried: 0
    },
    idle: overrides.idle ?? true
  };
}

async function captureStructuredLogs<T>(
  callback: () => Promise<T>
): Promise<Array<Record<string, unknown>>> {
  const originalWrite = process.stdout.write.bind(process.stdout);
  const lines: string[] = [];

  process.stdout.write = ((chunk: string | Uint8Array) => {
    lines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;

  try {
    await callback();
  } finally {
    process.stdout.write = originalWrite;
  }

  return lines
    .flatMap((line) => line.split("\n"))
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function findEvents(
  logs: Array<Record<string, unknown>>,
  event: string
): Array<Record<string, unknown>> {
  return logs.filter((log) => log.event === event);
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  while (!condition()) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
