import type { NextFunction, Request, Response } from "express";

import { recordHttpRequestMetric } from "../observability/api-metrics.js";
import { getLogger } from "../observability/platform-logger.js";
import {
  REQUEST_CONTEXT_HEADER,
  requestContextStorage,
  type RequestWithContext
} from "../observability/request-context.js";

export function requestLoggingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const startedAt = process.hrtime.bigint();

  // Get context from request
  const context = (request as RequestWithContext).context;
  const requestId = context?.requestId ?? request.header(REQUEST_CONTEXT_HEADER.REQUEST_ID) ?? null;
  const traceId = context?.traceId ?? request.header(REQUEST_CONTEXT_HEADER.TRACE_ID) ?? null;

  requestContextStorage.run(
    {
      requestId: requestId ?? "",
      traceId: traceId ?? ""
    },
    () => {
      getContextualLogger().info({
        event: "http.request.started",
        component: "HttpRequest",
        method: request.method,
        path: request.originalUrl
      });

      response.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        recordHttpRequestMetric(response.statusCode, durationMs);

        getContextualLogger().info({
          event: "http.request.completed",
          component: "HttpRequest",
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Number(durationMs.toFixed(2))
        });
      });

      next();
    }
  );
}

// Export root logger for use in other modules (e.g., repository, service)
// Use getContextualLogger() to get a logger with request context
export function getContextualLogger() {
  return getLogger();
}
