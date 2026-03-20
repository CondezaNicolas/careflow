import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";

import {
  REQUEST_CONTEXT_HEADER,
  resolveRequestId,
  type RequestWithContext
} from "../observability/request-context.js";
import {
  API_ERROR_CODE,
  createErrorEnvelope,
  type ErrorEnvelope,
  type ErrorEnvelopeDetail
} from "../errors/error-envelope.js";
import { getLogger, normalizeError } from "../observability/platform-logger.js";

@Catch()
export class HttpExceptionEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    // Get requestId from context (preferred) or fallback to header
    const requestContext = (request as RequestWithContext).context;
    const requestId =
      requestContext?.requestId ??
      (request.headers[REQUEST_CONTEXT_HEADER.REQUEST_ID] as string | undefined) ??
      resolveRequestId(request) ??
      null;

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = toHttpErrorEnvelope(exception, requestId);

      if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        getLogger({ component: "HttpExceptionFilter" }).error({
          event: "http.request.failed",
          method: request.method,
          path: request.originalUrl,
          statusCode,
          error: normalizeError(exception)
        });
      }

      response.status(statusCode).json(payload);
      return;
    }

    getLogger({ component: "HttpExceptionFilter" }).error({
      event: "http.request.unhandled_exception",
      method: request.method,
      path: request.originalUrl,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: normalizeError(exception)
    });

    const payload: ErrorEnvelope = createErrorEnvelope({
      requestId,
      code: API_ERROR_CODE.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR
    });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(payload);
  }
}

function toHttpErrorEnvelope(exception: HttpException, requestId: string | null): ErrorEnvelope {
  const statusCode = exception.getStatus();
  const response = exception.getResponse();

  if (typeof response === "string") {
    return createErrorEnvelope({
      requestId,
      statusCode,
      message: response
    });
  }

  if (!isRecord(response)) {
    return createErrorEnvelope({
      requestId,
      statusCode,
      message: exception.message
    });
  }

  if (isHttpErrorBody(response)) {
    return createErrorEnvelope({
      requestId,
      statusCode,
      code: response.code,
      message: response.message,
      details: response.details
    });
  }

  return createErrorEnvelope({
    requestId,
    statusCode,
    code: Array.isArray(response.message) ? API_ERROR_CODE.VALIDATION_ERROR : undefined,
    message: resolveResponseMessage(response, exception.message),
    details: Array.isArray(response.message)
      ? response.message.map((message) => ({ message }))
      : undefined
  });
}

function resolveResponseMessage(
  response: Record<string, unknown>,
  fallbackMessage: string
): string {
  if (typeof response.message === "string") {
    return response.message;
  }

  if (Array.isArray(response.message) && response.message.length > 0) {
    return "Request validation failed";
  }

  if (typeof response.error === "string") {
    return response.error;
  }

  return fallbackMessage;
}

function isHttpErrorBody(
  value: Record<string, unknown>
): value is { code?: string; details?: ErrorEnvelopeDetail[]; message: string } {
  return typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
