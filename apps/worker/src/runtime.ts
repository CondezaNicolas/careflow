import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import {
  parseWorkerEnv,
  resolveWorkerRuntimeConfig,
  type WorkerEnv,
  type WorkerRuntimeConfig
} from "./env.js";
import {
  createGoogleCalendarProvider,
  type GoogleCalendarProviderResolution
} from "./providers/google-calendar.js";
import {
  createNotificationsProvider,
  type NotificationsProviderResolution
} from "./providers/notifications.js";
import {
  GoogleCalendarOutboxWorker,
  NotificationOutboxWorker,
  getWorkerMetricsSnapshot,
  logStructured
} from "./worker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), quiet: true });

export interface WorkerRuntimeShell {
  env: WorkerEnv;
  config: WorkerRuntimeConfig;
  providerResolution: WorkerProviderRuntimeResolution;
  pool: Pool;
  googleCalendarWorker: GoogleCalendarOutboxWorker;
  notificationsWorker: NotificationOutboxWorker;
  runSingleCycle(runId?: string): Promise<WorkerCycleResult>;
  close(): Promise<void>;
}

export interface WorkerRuntimeLoop {
  config: WorkerRuntimeConfig;
  providerResolution: WorkerProviderRuntimeResolution;
  runSingleCycle(runId?: string): Promise<WorkerCycleResult>;
  close(): Promise<void>;
}

export interface WorkerProviderRuntimeResolution {
  googleCalendar: GoogleCalendarProviderResolution;
  notifications: NotificationsProviderResolution;
}

interface CreateWorkerRuntimeOptions {
  envSource?: NodeJS.ProcessEnv;
  pool?: Pool;
}

export const WORKER_SHUTDOWN_SIGNAL = {
  SIGINT: "SIGINT",
  SIGTERM: "SIGTERM"
} as const;

type WorkerShutdownSignal = (typeof WORKER_SHUTDOWN_SIGNAL)[keyof typeof WORKER_SHUTDOWN_SIGNAL];

export const WORKER_WAIT_OUTCOME = {
  TIMEOUT: "timeout",
  SHUTDOWN: "shutdown"
} as const;

type WorkerWaitOutcome = (typeof WORKER_WAIT_OUTCOME)[keyof typeof WORKER_WAIT_OUTCOME];

export interface WorkerPipelineCycleResult {
  processed: number;
  synced: number;
  failed: number;
  retried: number;
}

export interface WorkerCycleResult {
  runId: string;
  googleCalendar: WorkerPipelineCycleResult;
  notifications: WorkerPipelineCycleResult;
  idle: boolean;
}

export interface WorkerShutdownController {
  readonly shutdownRequested: boolean;
  readonly reason: string | null;
  requestShutdown(reason: string): boolean;
  onceShutdownRequested(): Promise<void>;
  dispose(): void;
}

interface CreateWorkerShutdownControllerOptions {
  shutdownGracePeriodMs: number;
  onShutdownRequested?: (reason: string) => void;
  onGracePeriodExceeded?: (reason: string) => void;
}

interface WorkerSignalTarget {
  on(event: WorkerShutdownSignal, listener: () => void): unknown;
  off(event: WorkerShutdownSignal, listener: () => void): unknown;
}

interface RunWorkerLoopOptions {
  shutdownController?: WorkerShutdownController;
  waitForNextCycle?: (
    pollIntervalMs: number,
    shutdownController: WorkerShutdownController
  ) => Promise<WorkerWaitOutcome>;
}

interface RunWorkerProcessOptions extends CreateWorkerRuntimeOptions {
  signalTarget?: WorkerSignalTarget;
}

export function createWorkerRuntime(options: CreateWorkerRuntimeOptions = {}): WorkerRuntimeShell {
  const env = parseWorkerEnv(options.envSource ?? process.env);
  const runtimeConfig = resolveWorkerRuntimeConfig(env);
  const pool = options.pool ?? new Pool({ connectionString: env.DATABASE_URL });
  const ownsPool = !options.pool;

  const googleCalendarProvider = createGoogleCalendarProvider(env);
  const notificationsProvider = createNotificationsProvider(env);

  const googleCalendarWorker = new GoogleCalendarOutboxWorker(
    pool,
    googleCalendarProvider.gateway,
    {
      maxRetries: env.GOOGLE_CALENDAR_MAX_RETRIES,
      backoffSeconds: env.GOOGLE_CALENDAR_BACKOFF_SECONDS
    }
  );
  const notificationsWorker = new NotificationOutboxWorker(pool, notificationsProvider.gateway, {
    maxRetries: env.NOTIFICATIONS_MAX_RETRIES,
    backoffSeconds: env.NOTIFICATIONS_BACKOFF_SECONDS
  });

  let closed = false;

  return {
    env,
    config: runtimeConfig,
    providerResolution: {
      googleCalendar: googleCalendarProvider.resolution,
      notifications: notificationsProvider.resolution
    },
    pool,
    googleCalendarWorker,
    notificationsWorker,
    async runSingleCycle(runId = randomUUID()) {
      const [calendarResult, notificationsResult] = await Promise.all([
        googleCalendarWorker.processPending(),
        notificationsWorker.processPending()
      ]);

      return {
        runId,
        googleCalendar: calendarResult,
        notifications: notificationsResult,
        idle: calendarResult.processed === 0 && notificationsResult.processed === 0
      };
    },
    async close() {
      if (closed || !ownsPool) {
        return;
      }

      closed = true;
      await pool.end();
    }
  };
}

export function createWorkerShutdownController(
  options: CreateWorkerShutdownControllerOptions
): WorkerShutdownController {
  let shutdownRequested = false;
  let reason: string | null = null;
  let resolveShutdown: (() => void) | null = null;
  let gracePeriodTimer: NodeJS.Timeout | null = null;

  const shutdownPromise = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });

  return {
    get shutdownRequested() {
      return shutdownRequested;
    },
    get reason() {
      return reason;
    },
    requestShutdown(nextReason: string) {
      if (shutdownRequested) {
        return false;
      }

      shutdownRequested = true;
      reason = nextReason;
      options.onShutdownRequested?.(nextReason);
      resolveShutdown?.();
      resolveShutdown = null;
      gracePeriodTimer = setTimeout(() => {
        options.onGracePeriodExceeded?.(nextReason);
      }, options.shutdownGracePeriodMs);
      return true;
    },
    onceShutdownRequested() {
      return shutdownPromise;
    },
    dispose() {
      if (gracePeriodTimer) {
        clearTimeout(gracePeriodTimer);
        gracePeriodTimer = null;
      }
    }
  };
}

export function registerShutdownSignals(
  target: WorkerSignalTarget,
  shutdownController: WorkerShutdownController
): () => void {
  const listeners = {
    [WORKER_SHUTDOWN_SIGNAL.SIGINT]: () => {
      shutdownController.requestShutdown(WORKER_SHUTDOWN_SIGNAL.SIGINT);
    },
    [WORKER_SHUTDOWN_SIGNAL.SIGTERM]: () => {
      shutdownController.requestShutdown(WORKER_SHUTDOWN_SIGNAL.SIGTERM);
    }
  };

  target.on(WORKER_SHUTDOWN_SIGNAL.SIGINT, listeners.SIGINT);
  target.on(WORKER_SHUTDOWN_SIGNAL.SIGTERM, listeners.SIGTERM);

  return () => {
    target.off(WORKER_SHUTDOWN_SIGNAL.SIGINT, listeners.SIGINT);
    target.off(WORKER_SHUTDOWN_SIGNAL.SIGTERM, listeners.SIGTERM);
  };
}

export async function waitForNextCycle(
  pollIntervalMs: number,
  shutdownController: WorkerShutdownController
): Promise<WorkerWaitOutcome> {
  if (shutdownController.shutdownRequested) {
    return WORKER_WAIT_OUTCOME.SHUTDOWN;
  }

  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      new Promise<WorkerWaitOutcome>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve(WORKER_WAIT_OUTCOME.TIMEOUT);
        }, pollIntervalMs);
      }),
      shutdownController
        .onceShutdownRequested()
        .then(() => WORKER_WAIT_OUTCOME.SHUTDOWN satisfies WorkerWaitOutcome)
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function runWorkerLoop(
  runtime: WorkerRuntimeLoop,
  options: RunWorkerLoopOptions = {}
): Promise<void> {
  const shutdownController =
    options.shutdownController ??
    createWorkerShutdownController({
      shutdownGracePeriodMs: runtime.config.shutdownGracePeriodMs
    });
  const nextCycleWaiter = options.waitForNextCycle ?? waitForNextCycle;
  let cycle = 0;

  logStructured("worker.runtime.started", {
    runtimeMode: runtime.config.runtimeMode,
    pollIntervalMs: runtime.config.pollIntervalMs,
    shutdownGracePeriodMs: runtime.config.shutdownGracePeriodMs,
    providerModes: runtime.config.providerModes,
    providerResolution: runtime.providerResolution
  });

  try {
    while (!shutdownController.shutdownRequested) {
      cycle += 1;
      const runId = randomUUID();

      logStructured("worker.cycle.started", {
        cycle,
        runId
      });

      const result = await runtime.runSingleCycle(runId);

      logStructured("worker.cycle.completed", {
        cycle,
        runId: result.runId,
        idle: result.idle,
        googleCalendar: result.googleCalendar,
        notifications: result.notifications,
        metricsSnapshot: getWorkerMetricsSnapshot()
      });

      if (result.idle) {
        logStructured("worker.cycle.idle", {
          cycle,
          runId: result.runId
        });
      }

      if (result.googleCalendar.failed > 0 || result.notifications.failed > 0) {
        logStructured("worker.cycle.requires_attention", {
          cycle,
          runId: result.runId,
          failedCalendarEvents: result.googleCalendar.failed,
          failedNotificationEvents: result.notifications.failed
        });
      }

      if (shutdownController.shutdownRequested) {
        break;
      }

      const waitOutcome = await nextCycleWaiter(runtime.config.pollIntervalMs, shutdownController);
      if (waitOutcome === WORKER_WAIT_OUTCOME.SHUTDOWN) {
        break;
      }
    }
  } finally {
    shutdownController.dispose();
    await runtime.close();
    logStructured("worker.runtime.stopped", {
      reason: shutdownController.reason ?? "loop_completed"
    });
  }
}

export async function runWorkerProcess(options: RunWorkerProcessOptions = {}): Promise<void> {
  const runtime = createWorkerRuntime(options);
  const shutdownController = createWorkerShutdownController({
    shutdownGracePeriodMs: runtime.config.shutdownGracePeriodMs,
    onShutdownRequested(reason) {
      logStructured("worker.shutdown.requested", {
        signal: reason
      });
    },
    onGracePeriodExceeded(reason) {
      logStructured("worker.shutdown.grace_period_exceeded", {
        signal: reason,
        shutdownGracePeriodMs: runtime.config.shutdownGracePeriodMs
      });
    }
  });
  const cleanupSignals = registerShutdownSignals(
    options.signalTarget ?? process,
    shutdownController
  );

  try {
    await runWorkerLoop(runtime, { shutdownController });
  } finally {
    cleanupSignals();
  }
}
