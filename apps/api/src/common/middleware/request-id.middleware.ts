import type { NextFunction, Request, Response } from "express";

import {
  REQUEST_CONTEXT_HEADER,
  resolveOrCreateRequestContext,
  type RequestWithContext
} from "../observability/request-context.js";

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const context = resolveOrCreateRequestContext(request);
  request.headers[REQUEST_CONTEXT_HEADER.REQUEST_ID] = context.requestId;
  request.headers[REQUEST_CONTEXT_HEADER.TRACE_ID] = context.traceId;
  (request as RequestWithContext).context = context;
  response.setHeader(REQUEST_CONTEXT_HEADER.REQUEST_ID, context.requestId);
  response.setHeader(REQUEST_CONTEXT_HEADER.TRACE_ID, context.traceId);
  next();
}
