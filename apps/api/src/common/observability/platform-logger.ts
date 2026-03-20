import pino from "pino";

import { getRequestContext } from "./request-context.js";

const SERVICE_NAME = "lia-clinic-core-api";

export interface PlatformLogBindings {
  component?: string;
  event?: string;
  [key: string]: unknown;
}

const rootLogger = pino({
  level: process.env.LOG_LEVEL?.trim().toLowerCase() || "info",
  base: {
    service: SERVICE_NAME
  },
  formatters: {
    level: (label) => ({ level: label })
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

export function getLogger(bindings: PlatformLogBindings = {}) {
  return rootLogger.child({
    ...getRequestContextBindings(),
    ...bindings
  });
}

export function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: String(error)
  };
}

function getRequestContextBindings(): Record<string, string> {
  const requestContext = getRequestContext();

  if (!requestContext) {
    return {};
  }

  return {
    requestId: requestContext.requestId,
    traceId: requestContext.traceId
  };
}
