import { randomUUID } from "node:crypto";

import type { Request } from "express";

const REQUEST_ID_HEADER = "x-request-id";
const TRACE_ID_HEADER = "x-trace-id";

export interface RequestContext {
  requestId: string;
  traceId: string;
}

export interface RequestWithContext extends Request {
  context?: RequestContext;
}

export function resolveOrCreateRequestContext(request: Request): RequestContext {
  const requestId = resolveHeaderValue(request.header(REQUEST_ID_HEADER));
  const traceId = resolveHeaderValue(request.header(TRACE_ID_HEADER));

  return {
    requestId: requestId ?? randomUUID(),
    traceId: traceId ?? requestId ?? randomUUID()
  };
}

function resolveHeaderValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export const REQUEST_CONTEXT_HEADER = {
  REQUEST_ID: REQUEST_ID_HEADER,
  TRACE_ID: TRACE_ID_HEADER
} as const;
