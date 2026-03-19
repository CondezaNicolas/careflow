import type { NextFunction, Request, Response } from "express";

import { recordHttpRequestMetric } from "../observability/api-metrics.js";
import { REQUEST_CONTEXT_HEADER, type RequestWithContext } from "../observability/request-context.js";

export function requestLoggingMiddleware(request: Request, response: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();

  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    recordHttpRequestMetric(response.statusCode, durationMs);

    const context = (request as RequestWithContext).context;
    const line = {
      level: "info",
      event: "http.request.completed",
      method: request.method,
      path: request.originalUrl,
      statusCode: response.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      requestId: context?.requestId ?? request.header(REQUEST_CONTEXT_HEADER.REQUEST_ID) ?? null,
      traceId: context?.traceId ?? request.header(REQUEST_CONTEXT_HEADER.TRACE_ID) ?? null
    };
    process.stdout.write(`${JSON.stringify(line)}\n`);
  });

  next();
}
