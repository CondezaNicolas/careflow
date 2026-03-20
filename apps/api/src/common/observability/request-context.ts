import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

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

// AsyncLocalStorage for propagating request context through async operations
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function resolveOrCreateRequestContext(request: Request): RequestContext {
  const requestId = resolveRequestId(request);
  const traceId = resolveHeaderValue(request.header(TRACE_ID_HEADER));

  return {
    requestId: requestId ?? randomUUID(),
    traceId: traceId ?? requestId ?? randomUUID()
  };
}

export function resolveRequestId(request: Request): string | null {
  return resolveHeaderValue(request.header(REQUEST_ID_HEADER));
}

function resolveHeaderValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export const REQUEST_CONTEXT_HEADER = {
  REQUEST_ID: REQUEST_ID_HEADER,
  TRACE_ID: TRACE_ID_HEADER
} as const;
